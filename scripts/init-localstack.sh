#!/bin/bash
echo "Creating SQS queues..."
awslocal sqs create-queue --queue-name enrichment-http-queue
awslocal sqs create-queue --queue-name enrichment-browser-queue
awslocal sqs create-queue --queue-name enrichment-webhook-queue
awslocal sqs create-queue --queue-name enrichment-export-queue
awslocal sqs create-queue --queue-name enrichment-dlq
echo "SQS queues created."
