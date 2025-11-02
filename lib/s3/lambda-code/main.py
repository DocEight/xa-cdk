import json
import os
import logging
import boto3
from botocore.exceptions import ClientError

# Testing
LOCAL = os.environ.get("LOCAL", "false")
local_endpoint_url = "http://localhost:4566"

# STS client (points to LocalStack if LOCAL environment variable set to true)
sts = (
    boto3.client(
        "sts",
        endpoint_url=local_endpoint_url,
        region_name="ap-northeast-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    if LOCAL == "true"
    else boto3.client("sts")
)

XA_MGMT_ROLE_ARN = os.environ["XA_MGMT_ROLE_ARN"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
ACCESSOR_AWS_ID = os.environ["ACCESSOR_AWS_ID"]
ACCESSOR_STACK_NAME = os.environ["ACCESSOR_STACK_NAME"]

logger = logging.getLogger()
logger.setLevel("INFO")


def s3_client_with_role(operation):
    logger.info(f"assuming role: {XA_MGMT_ROLE_ARN}")
    assume_role_response = sts.assume_role(
        RoleArn=XA_MGMT_ROLE_ARN,
        RoleSessionName=f"{BUCKET_NAME}-policy-{operation}",
    )
    credentials = assume_role_response["Credentials"]

    session = boto3.Session(
        aws_access_key_id=credentials["AccessKeyId"],
        aws_secret_access_key=credentials["SecretAccessKey"],
        aws_session_token=credentials["SessionToken"],
    )

    return (
        session.client("s3", endpoint_url=local_endpoint_url)
        if LOCAL == "true"
        else session.client("s3")
    )


def get_bucket_policy(s3):
    try:
        get_policy_response = s3.get_bucket_policy(Bucket=BUCKET_NAME)
        return json.loads(get_policy_response["Policy"])
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code")
        if error_code == "NoSuchBucketPolicy":
            logger.info(f"No bucket policy found for {BUCKET_NAME}, starting fresh.")
            return {"Version": "2012-10-17", "Statement": []}
        else:
            logger.error(f"Failed to get bucket policy: {e}")
            raise


def put_bucket_policy(s3, policy):
    try:
        s3.put_bucket_policy(Bucket=BUCKET_NAME, Policy=json.dumps(policy))
        logger.info("Successfully updated bucket policy")
    except ClientError as e:
        logger.error(f"Failed to update bucket policy: {e}")
        raise


def handler(event, context):
    operation = event["operation"]
    logger.info(f"operation: {operation}")

    s3 = s3_client_with_role(operation)

    cloudfront_distribution_ids = sorted(list(event["cloudfrontAccessors"].keys()))
    logger.info(f"cloudfrontAccessors: {'\n- '.join(cloudfront_distribution_ids)}")

    # First, remove the statements set by this stack
    bucket_policy = get_bucket_policy(s3)
    sid_prefix = f"{ACCESSOR_AWS_ID} {ACCESSOR_STACK_NAME} "
    bucket_policy["Statement"] = [
        statement
        for statement in bucket_policy["Statement"]
        if not statement.get("Sid", "").startswith(sid_prefix)
    ]

    # Re-add the statements if this is not a delete operation
    if operation != "delete":
        for id in cloudfront_distribution_ids:
            actions = event["cloudfrontAccessors"][id]
            statement = {
                "Sid": f"{sid_prefix}: cf-{id}",
                "Effect": "Allow",
                "Principal": {"Service": "cloudfront.amazonaws.com"},
                "Action": actions,
                "Resource": f"arn:aws:s3:::{BUCKET_NAME}/*",
                "Condition": {
                    "StringEquals": {
                        "AWS:SourceArn": f"arn:aws:cloudfront::{ACCESSOR_AWS_ID}:distribution/{id}"
                    }
                },
            }
            bucket_policy["Statement"].append(statement)

    # Update the bucket policy
    put_bucket_policy(s3, bucket_policy)
