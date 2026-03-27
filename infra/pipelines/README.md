# Getouch Multimodal Orchestrator

This directory contains the production pipeline for routed multimodal execution in Open WebUI Pipelines.

## Components

- Chat Orchestrator: `getouch_orchestrator_pipeline.py`
- Document Service: embedded inside pipeline (`_parse_document`, `_ingest_document`, `_retrieve_context`)
- Vision Service: embedded inside pipeline (`_analyze_images`)
- Response Composer: embedded inside pipeline (`_compose_system_context`)

## Routing Modes

- `text_only`
- `text_with_documents`
- `image_understanding`
- `mixed_multimodal`
- `tool_required`
- `fallback`

## Supported File Types

- PDF
- DOC/DOCX
- TXT/MD
- CSV
- XLS/XLSX
- PPT/PPTX

## Ingestion Output Stored

- file metadata
- extracted text
- parser notes and confidence
- chunked segments with source references
- embedding vectors (Ollama embedding model)

## Runtime Notes

- Designed to run as an Open WebUI Pipelines filter.
- Routes requests to fast text model or vision model before model execution.
- Uses retrieval context and source references in the composed system prompt.
- Includes structured logs for routing, ingestion, and failures.
