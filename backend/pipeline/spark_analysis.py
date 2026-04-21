"""
PySpark batch analysis for large-scale patient data.

Demonstrates Week 13 course topic: PySpark / Big Data processing.
Processes historical vital-sign data using Spark DataFrames with
SQL-style aggregations for retrospective anomaly analysis.
"""
import numpy as np

try:
    from pyspark.sql import SparkSession
    from pyspark.sql import functions as F
    from pyspark.sql.types import (
        StructType,
        StructField,
        StringType,
        FloatType,
        TimestampType,
    )
    SPARK_AVAILABLE = True
except ImportError:
    SPARK_AVAILABLE = False


def get_spark_session() -> "SparkSession":
    """Create or get a local SparkSession configured for PulseStream."""
    if not SPARK_AVAILABLE:
        raise RuntimeError("PySpark is not installed. pip install pyspark")
    return (
        SparkSession.builder
        .master("local[*]")
        .appName("PulseStream-BatchAnalysis")
        .config("spark.driver.memory", "2g")
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )


VITALS_SCHEMA = StructType([
    StructField("patient_id", StringType(), False),
    StructField("hr", FloatType(), True),
    StructField("o2sat", FloatType(), True),
    StructField("temp", FloatType(), True),
    StructField("sbp", FloatType(), True),
    StructField("resp", FloatType(), True),
])


def numpy_to_spark_df(data: np.ndarray, n_patients: int):
    """Convert benchmark NumPy array to a Spark DataFrame.

    Flattens (n_patients, window_size, 5) into rows with a patient_id
    column for group-by operations.
    """
    spark = get_spark_session()
    rows = []
    for p in range(data.shape[0]):
        pid = f"patient_{p:04d}"
        for t in range(data.shape[1]):
            rows.append((
                pid,
                float(data[p, t, 0]),
                float(data[p, t, 1]),
                float(data[p, t, 2]),
                float(data[p, t, 3]),
                float(data[p, t, 4]),
            ))
    return spark.createDataFrame(rows, schema=VITALS_SCHEMA)


def compute_patient_stats(data: np.ndarray) -> list[dict]:
    """Compute per-patient vital statistics using Spark SQL.

    Groups by patient_id and computes mean, stddev, min, max for
    each vital sign — a typical retrospective analytics query.
    """
    df = numpy_to_spark_df(data, data.shape[0])

    vitals = ["hr", "o2sat", "temp", "sbp", "resp"]
    agg_exprs = []
    for v in vitals:
        agg_exprs.extend([
            F.mean(v).alias(f"{v}_mean"),
            F.stddev(v).alias(f"{v}_std"),
            F.min(v).alias(f"{v}_min"),
            F.max(v).alias(f"{v}_max"),
        ])

    stats_df = df.groupBy("patient_id").agg(*agg_exprs)
    return [row.asDict() for row in stats_df.collect()]


def detect_anomalies_spark(data: np.ndarray, z_threshold: float = 3.0) -> list[dict]:
    """Identify anomalous patients using Spark window functions.

    For each patient, computes mean and stddev per vital, then flags
    any patient whose latest reading exceeds the Z-score threshold.
    """
    df = numpy_to_spark_df(data, data.shape[0])

    vitals = ["hr", "o2sat", "temp", "sbp", "resp"]
    stats = df.groupBy("patient_id").agg(
        *[F.mean(v).alias(f"{v}_mean") for v in vitals],
        *[F.stddev(v).alias(f"{v}_std") for v in vitals],
        *[F.last(v).alias(f"{v}_last") for v in vitals],
    )

    conditions = []
    for v in vitals:
        z_expr = F.abs((F.col(f"{v}_last") - F.col(f"{v}_mean")) / F.col(f"{v}_std"))
        conditions.append(z_expr > z_threshold)

    anomaly_condition = conditions[0]
    for c in conditions[1:]:
        anomaly_condition = anomaly_condition | c

    anomalies = stats.filter(anomaly_condition)
    return [row.asDict() for row in anomalies.collect()]


def run_spark_benchmark(data: np.ndarray) -> dict:
    """Run Spark analysis and return timing info."""
    import time

    spark = get_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    start = time.perf_counter()
    stats = compute_patient_stats(data)
    stats_time = time.perf_counter() - start

    start = time.perf_counter()
    anomalies = detect_anomalies_spark(data)
    detect_time = time.perf_counter() - start

    spark.stop()

    return {
        "stats_patients": len(stats),
        "stats_time_ms": round(stats_time * 1000, 1),
        "anomalies_found": len(anomalies),
        "detect_time_ms": round(detect_time * 1000, 1),
    }
