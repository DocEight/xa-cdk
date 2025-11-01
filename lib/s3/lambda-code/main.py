import os
import logging
import boto3

s3 = boto3.client("s3")

# Initialize the logger
logger = logging.getLogger()
logger.setLevel("INFO")


def handler(event, context):
    pass
