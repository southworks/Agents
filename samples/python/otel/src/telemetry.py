# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import logging
import os
import requests

import aiohttp
from opentelemetry import metrics, trace
from opentelemetry.trace import Span, Status, StatusCode
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from opentelemetry.instrumentation.aiohttp_server import AioHttpServerInstrumentor
from opentelemetry.instrumentation.aiohttp_client import AioHttpClientInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

SERVICE_NAME = "OTelAgent"
SERVICE_VERSION = "1.0.0"
TRACER = None
ROUTE_EXECUTION_COUNTER = None
MESSAGE_PROCESSING_DURATION = None


def get_tracer():
    return TRACER or trace.get_tracer(SERVICE_NAME, SERVICE_VERSION)


def record_route_execution(route_type: str, conversation_id: str):
    if ROUTE_EXECUTION_COUNTER is not None:
        ROUTE_EXECUTION_COUNTER.add(
            1,
            {
                "route.type": route_type,
                "conversation.id": conversation_id,
            },
        )


def record_message_duration(duration_ms: float, conversation_id: str, channel_id: str, status: str):
    if MESSAGE_PROCESSING_DURATION is not None:
        MESSAGE_PROCESSING_DURATION.record(
            duration_ms,
            {
                "conversation.id": conversation_id,
                "channel.id": channel_id,
                "status": status,
            },
        )


def instrument_aiohttp_server():
    """Instrument aiohttp before application creation for inbound request tracing."""

    AioHttpServerInstrumentor().instrument()

def instrument_libraries():
    """Instrument libraries for OpenTelemetry."""

    # ##
    # # instrument aiohttp client
    # ##
    def aiohttp_client_request_hook(
        span: Span, params: aiohttp.TraceRequestStartParams
    ):
        if span and span.is_recording():
            span.set_attribute("http.url", str(params.url))

    def aiohttp_client_response_hook(
        span: Span,
        params: aiohttp.TraceRequestEndParams | aiohttp.TraceRequestExceptionParams,
    ):
        if span and span.is_recording():
            span.set_attribute("http.url", str(params.url))

    AioHttpClientInstrumentor().instrument(
        request_hook=aiohttp_client_request_hook,
        response_hook=aiohttp_client_response_hook,
    )

    #
    # instrument requests library
    ##
    def requests_request_hook(span: Span, request: requests.Request):
        if span and span.is_recording():
            span.set_attribute("http.url", request.url)

    def requests_response_hook(
        span: Span, request: requests.Request, response: requests.Response
    ):
        if span and span.is_recording():
            span.set_attribute("http.url", response.url)

    RequestsInstrumentor().instrument(
        request_hook=requests_request_hook, response_hook=requests_response_hook
    )

def configure_otel_providers(service_name: str = "app"):
    """Configure OpenTelemetry for FastAPI application."""

    global SERVICE_NAME, TRACER, ROUTE_EXECUTION_COUNTER, MESSAGE_PROCESSING_DURATION

    SERVICE_NAME = service_name

    # Create resource with service name
    resource = Resource.create(
        {
            "service.name": service_name,
            "service.version": SERVICE_VERSION,
            "service.instance.id": os.getenv("HOSTNAME", "unknown"),
            "telemetry.sdk.language": "python",
        }
    )

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317/")

    # Configure Tracing
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint))
    )
    trace.set_tracer_provider(tracer_provider)
    TRACER = trace.get_tracer(service_name, SERVICE_VERSION)

    # Configure Metrics
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=endpoint)
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)
    meter = metrics.get_meter(service_name, SERVICE_VERSION)
    ROUTE_EXECUTION_COUNTER = meter.create_counter(
        "agent.routes.executed.count",
        unit="routes",
        description="Number of routes executed by the agent",
    )
    MESSAGE_PROCESSING_DURATION = meter.create_histogram(
        "agent.message.processing.duration",
        unit="ms",
        description="Duration of message processing in milliseconds",
    )

    # Configure Logging
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(OTLPLogExporter(endpoint=endpoint))
    )
    set_logger_provider(logger_provider)

    # Add logging handler
    handler = LoggingHandler(level=logging.NOTSET, logger_provider=logger_provider)
    logging.getLogger().addHandler(handler)

    logging.getLogger().info("OpenTelemetry providers configured with endpoint: %s", endpoint)

    instrument_libraries()