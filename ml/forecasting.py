"""
ML Forecasting Service for Nexus Pricing
Implements Prophet and LSTM models for demand/occupancy forecasting
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import uuid

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from prophet import Prophet
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error
import tensorflow as tf
from tensorflow import keras
import joblib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Nexus Pricing ML Service",
    description="Machine Learning forecasting service for dynamic pricing",
    version="1.0.0"
)

# Models directory
MODELS_DIR = os.getenv('MODELS_DIR', '/app/models')
os.makedirs(MODELS_DIR, exist_ok=True)

# Training jobs storage (in production, use Redis or database)
training_jobs: Dict[str, Dict[str, Any]] = {}


# Pydantic models
class HistoricalDataPoint(BaseModel):
    date: str
    value: float
    metadata: Optional[Dict[str, Any]] = None


class ForecastRequest(BaseModel):
    propertyId: str
    startDate: str
    endDate: str
    modelType: str = Field(..., pattern='^(demand|occupancy|revenue)$')
    historicalData: Optional[List[HistoricalDataPoint]] = None


class ForecastPoint(BaseModel):
    date: str
    predictedValue: float
    lowerBound: Optional[float] = None
    upperBound: Optional[float] = None
    confidence: float


class ForecastResponse(BaseModel):
    propertyId: str
    modelType: str
    forecast: List[ForecastPoint]
    accuracy: Optional[float] = None
    mape: Optional[float] = None
    generatedAt: str


class TrainingRequest(BaseModel):
    modelType: str = Field(..., pattern='^(prophet|lstm|optimization)$')
    propertyId: Optional[str] = None
    trainingData: List[HistoricalDataPoint]
    parameters: Optional[Dict[str, Any]] = None


class TrainingResponse(BaseModel):
    jobId: str
    modelType: str
    status: str
    accuracy: Optional[float] = None
    mape: Optional[float] = None
    errorMessage: Optional[str] = None


class OptimizePriceRequest(BaseModel):
    propertyId: str
    date: str
    context: Dict[str, Any]


class OptimizePriceResponse(BaseModel):
    recommendedPrice: float
    confidence: float


# Prophet Model Implementation
class ProphetForecaster:
    """Prophet-based forecasting for time series data"""

    def __init__(self):
        self.model = None
        self.scaler = MinMaxScaler()

    def train(self, data: pd.DataFrame, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
        """
        Train Prophet model

        Args:
            data: DataFrame with 'ds' (date) and 'y' (value) columns
            parameters: Optional Prophet parameters

        Returns:
            Dictionary with performance metrics
        """
        logger.info(f"Training Prophet model with {len(data)} data points")

        # Default parameters
        params = {
            'yearly_seasonality': True,
            'weekly_seasonality': True,
            'daily_seasonality': False,
            'changepoint_prior_scale': 0.05,
            'seasonality_prior_scale': 10.0
        }

        if parameters:
            params.update(parameters)

        # Initialize and fit model
        self.model = Prophet(**params)
        self.model.fit(data)

        # Calculate performance metrics
        forecast = self.model.predict(data)
        mape = mean_absolute_percentage_error(data['y'], forecast['yhat'])
        rmse = np.sqrt(mean_squared_error(data['y'], forecast['yhat']))

        logger.info(f"Prophet training complete - MAPE: {mape:.4f}, RMSE: {rmse:.4f}")

        return {
            'mape': mape,
            'rmse': rmse,
            'accuracy': 1 - mape
        }

    def forecast(self, periods: int, freq: str = 'D') -> pd.DataFrame:
        """
        Generate forecast for future periods

        Args:
            periods: Number of periods to forecast
            freq: Frequency ('D' for daily, 'W' for weekly, etc.)

        Returns:
            DataFrame with forecast
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        future = self.model.make_future_dataframe(periods=periods, freq=freq)
        forecast = self.model.predict(future)

        return forecast

    def save(self, path: str):
        """Save model to disk"""
        if self.model is not None:
            joblib.dump(self.model, path)
            logger.info(f"Prophet model saved to {path}")

    def load(self, path: str):
        """Load model from disk"""
        self.model = joblib.load(path)
        logger.info(f"Prophet model loaded from {path}")


# LSTM Model Implementation
class LSTMForecaster:
    """LSTM-based forecasting for time series data"""

    def __init__(self, sequence_length: int = 30):
        self.model = None
        self.scaler = MinMaxScaler()
        self.sequence_length = sequence_length

    def prepare_data(self, data: np.ndarray):
        """Prepare data for LSTM training"""
        # Normalize data
        scaled_data = self.scaler.fit_transform(data.reshape(-1, 1))

        # Create sequences
        X, y = [], []
        for i in range(len(scaled_data) - self.sequence_length):
            X.append(scaled_data[i:i + self.sequence_length])
            y.append(scaled_data[i + self.sequence_length])

        return np.array(X), np.array(y)

    def build_model(self, input_shape):
        """Build LSTM architecture"""
        model = keras.Sequential([
            keras.layers.LSTM(64, return_sequences=True, input_shape=input_shape),
            keras.layers.Dropout(0.2),
            keras.layers.LSTM(32, return_sequences=False),
            keras.layers.Dropout(0.2),
            keras.layers.Dense(16, activation='relu'),
            keras.layers.Dense(1)
        ])

        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )

        return model

    def train(self, data: np.ndarray, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
        """
        Train LSTM model

        Args:
            data: 1D numpy array of values
            parameters: Optional training parameters

        Returns:
            Dictionary with performance metrics
        """
        logger.info(f"Training LSTM model with {len(data)} data points")

        # Prepare data
        X, y = self.prepare_data(data)

        # Split train/validation
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]

        # Build model
        self.model = self.build_model((X.shape[1], 1))

        # Training parameters
        epochs = parameters.get('epochs', 50) if parameters else 50
        batch_size = parameters.get('batch_size', 32) if parameters else 32

        # Train
        early_stopping = keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=10,
            restore_best_weights=True
        )

        history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=[early_stopping],
            verbose=0
        )

        # Calculate metrics
        predictions = self.model.predict(X_val, verbose=0)
        mse = mean_squared_error(y_val, predictions)
        rmse = np.sqrt(mse)

        # Inverse transform for MAPE calculation
        y_val_inv = self.scaler.inverse_transform(y_val)
        pred_inv = self.scaler.inverse_transform(predictions)
        mape = mean_absolute_percentage_error(y_val_inv, pred_inv)

        logger.info(f"LSTM training complete - MAPE: {mape:.4f}, RMSE: {rmse:.4f}")

        return {
            'mape': mape,
            'rmse': rmse,
            'accuracy': 1 - mape
        }

    def forecast(self, last_sequence: np.ndarray, periods: int) -> np.ndarray:
        """
        Generate forecast for future periods

        Args:
            last_sequence: Last n values to use as input
            periods: Number of periods to forecast

        Returns:
            Array of forecasted values
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        # Normalize input
        scaled_sequence = self.scaler.transform(last_sequence.reshape(-1, 1))

        predictions = []
        current_sequence = scaled_sequence[-self.sequence_length:].reshape(1, self.sequence_length, 1)

        for _ in range(periods):
            # Predict next value
            next_pred = self.model.predict(current_sequence, verbose=0)[0]
            predictions.append(next_pred[0])

            # Update sequence
            current_sequence = np.append(current_sequence[:, 1:, :],
                                        [[next_pred]], axis=1)

        # Inverse transform predictions
        predictions = self.scaler.inverse_transform(np.array(predictions).reshape(-1, 1))

        return predictions.flatten()

    def save(self, path: str):
        """Save model to disk"""
        if self.model is not None:
            self.model.save(path)
            joblib.dump(self.scaler, f"{path}_scaler.pkl")
            logger.info(f"LSTM model saved to {path}")

    def load(self, path: str):
        """Load model from disk"""
        self.model = keras.models.load_model(path)
        self.scaler = joblib.load(f"{path}_scaler.pkl")
        logger.info(f"LSTM model loaded from {path}")


# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "nexus-pricing-ml"
    }


@app.post("/forecast", response_model=ForecastResponse)
async def generate_forecast(request: ForecastRequest):
    """
    Generate forecast using Prophet or LSTM models
    """
    try:
        logger.info(f"Forecast request for property {request.propertyId}, model: {request.modelType}")

        # Parse dates
        start_date = pd.to_datetime(request.startDate)
        end_date = pd.to_datetime(request.endDate)
        periods = (end_date - start_date).days + 1

        # Use Prophet for forecasting (default)
        forecaster = ProphetForecaster()

        # If historical data provided, train on it; otherwise use fallback
        if request.historicalData and len(request.historicalData) > 0:
            # Prepare data for Prophet
            df = pd.DataFrame([
                {
                    'ds': pd.to_datetime(point.date),
                    'y': point.value
                }
                for point in request.historicalData
            ])

            # Train model
            metrics = forecaster.train(df)

            # Generate forecast
            forecast_df = forecaster.forecast(periods)

            # Extract future predictions
            forecast_points = []
            for i in range(len(forecast_df)):
                date = forecast_df.iloc[i]['ds']
                if date >= start_date and date <= end_date:
                    forecast_points.append(ForecastPoint(
                        date=date.isoformat(),
                        predictedValue=float(forecast_df.iloc[i]['yhat']),
                        lowerBound=float(forecast_df.iloc[i]['yhat_lower']),
                        upperBound=float(forecast_df.iloc[i]['yhat_upper']),
                        confidence=0.8
                    ))
        else:
            # Fallback: simple forecast based on seasonal patterns
            logger.warning("No historical data provided, using fallback forecast")
            forecast_points = generate_fallback_forecast(start_date, end_date)
            metrics = {'mape': 0.2, 'accuracy': 0.8}

        return ForecastResponse(
            propertyId=request.propertyId,
            modelType=request.modelType,
            forecast=forecast_points,
            accuracy=metrics.get('accuracy'),
            mape=metrics.get('mape'),
            generatedAt=datetime.utcnow().isoformat()
        )

    except Exception as e:
        logger.error(f"Forecast error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/train", response_model=TrainingResponse)
async def train_model(request: TrainingRequest, background_tasks: BackgroundTasks):
    """
    Train a new ML model
    """
    job_id = str(uuid.uuid4())

    # Initialize job
    training_jobs[job_id] = {
        'status': 'PENDING',
        'modelType': request.modelType,
        'startedAt': datetime.utcnow().isoformat()
    }

    # Start training in background
    background_tasks.add_task(
        train_model_background,
        job_id,
        request
    )

    return TrainingResponse(
        jobId=job_id,
        modelType=request.modelType,
        status='PENDING'
    )


@app.get("/train/status/{job_id}", response_model=TrainingResponse)
async def get_training_status(job_id: str):
    """
    Get status of training job
    """
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Training job not found")

    job = training_jobs[job_id]

    return TrainingResponse(
        jobId=job_id,
        modelType=job['modelType'],
        status=job['status'],
        accuracy=job.get('accuracy'),
        mape=job.get('mape'),
        errorMessage=job.get('errorMessage')
    )


@app.post("/optimize-price", response_model=OptimizePriceResponse)
async def optimize_price(request: OptimizePriceRequest):
    """
    Get optimal price recommendation using ML
    """
    try:
        # Simple optimization based on context
        # In production, this would use a trained optimization model
        base_price = request.context.get('basePrice', 100)
        occupancy = request.context.get('currentOccupancy', 0.5)

        # Dynamic multiplier based on occupancy
        if occupancy >= 0.9:
            multiplier = 1.5
        elif occupancy >= 0.7:
            multiplier = 1.2
        elif occupancy >= 0.5:
            multiplier = 1.0
        elif occupancy >= 0.3:
            multiplier = 0.9
        else:
            multiplier = 0.85

        recommended_price = base_price * multiplier
        confidence = 0.75

        return OptimizePriceResponse(
            recommendedPrice=recommended_price,
            confidence=confidence
        )

    except Exception as e:
        logger.error(f"Price optimization error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Background tasks
async def train_model_background(job_id: str, request: TrainingRequest):
    """
    Background task for model training
    """
    try:
        training_jobs[job_id]['status'] = 'IN_PROGRESS'

        # Prepare data
        df = pd.DataFrame([
            {
                'ds': pd.to_datetime(point.date),
                'y': point.value
            }
            for point in request.trainingData
        ])

        if request.modelType == 'prophet':
            forecaster = ProphetForecaster()
            metrics = forecaster.train(df, request.parameters)

            # Save model
            model_path = os.path.join(
                MODELS_DIR,
                f"prophet_{request.propertyId or 'global'}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pkl"
            )
            forecaster.save(model_path)

        elif request.modelType == 'lstm':
            forecaster = LSTMForecaster()
            data = df['y'].values
            metrics = forecaster.train(data, request.parameters)

            # Save model
            model_path = os.path.join(
                MODELS_DIR,
                f"lstm_{request.propertyId or 'global'}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
            )
            forecaster.save(model_path)
        else:
            raise ValueError(f"Unknown model type: {request.modelType}")

        # Update job status
        training_jobs[job_id].update({
            'status': 'COMPLETED',
            'accuracy': metrics.get('accuracy'),
            'mape': metrics.get('mape'),
            'completedAt': datetime.utcnow().isoformat(),
            'modelPath': model_path
        })

    except Exception as e:
        logger.error(f"Training failed for job {job_id}: {str(e)}", exc_info=True)
        training_jobs[job_id].update({
            'status': 'FAILED',
            'errorMessage': str(e),
            'failedAt': datetime.utcnow().isoformat()
        })


def generate_fallback_forecast(start_date: pd.Timestamp, end_date: pd.Timestamp) -> List[ForecastPoint]:
    """
    Generate simple fallback forecast based on seasonal patterns
    """
    forecast_points = []
    current_date = start_date

    while current_date <= end_date:
        # Simple seasonal pattern
        month = current_date.month
        day_of_week = current_date.dayofweek

        # Base occupancy
        base_occupancy = 0.5

        # Seasonal adjustment
        seasonal_map = {
            1: 0.85, 2: 0.90, 3: 0.95, 4: 1.05, 5: 1.15, 6: 1.30,
            7: 1.35, 8: 1.35, 9: 1.20, 10: 1.10, 11: 0.95, 12: 1.00
        }
        seasonal_factor = seasonal_map[month]

        # Weekend adjustment
        weekend_factor = 1.2 if day_of_week >= 5 else 1.0

        predicted_value = base_occupancy * seasonal_factor * weekend_factor
        predicted_value = min(max(predicted_value, 0.0), 1.0)  # Clamp to [0, 1]

        forecast_points.append(ForecastPoint(
            date=current_date.isoformat(),
            predictedValue=predicted_value,
            lowerBound=max(predicted_value - 0.1, 0.0),
            upperBound=min(predicted_value + 0.1, 1.0),
            confidence=0.5
        ))

        current_date += timedelta(days=1)

    return forecast_points


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
