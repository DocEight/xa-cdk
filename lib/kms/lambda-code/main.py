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
KEY_ID = os.environ["KEY_ID"]
ACCESSOR_AWS_ID = os.environ["ACCESSOR_AWS_ID"]
ACCESSOR_STACK_NAME = os.environ["ACCESSOR_STACK_NAME"]

logger = logging.getLogger()
logger.setLevel("INFO")


def kms_client_with_role(operation):
    logger.info(f"assuming role: {XA_MGMT_ROLE_ARN}")
    assume_role_response = sts.assume_role(
        RoleArn=XA_MGMT_ROLE_ARN,
        RoleSessionName=f"{KEY_ID}-policy-{operation}",
    )
    credentials = assume_role_response["Credentials"]

    session = boto3.Session(
        aws_access_key_id=credentials["AccessKeyId"],
        aws_secret_access_key=credentials["SecretAccessKey"],
        aws_session_token=credentials["SessionToken"],
    )

    return (
        session.client("kms", endpoint_url=local_endpoint_url)
        if LOCAL == "true"
        else session.client("kms")
    )


def get_key_policy(kms):
    try:
        get_policy_response = kms.get_key_policy(KeyId=KEY_ID, PolicyName="default")
        return json.loads(get_policy_response["Policy"])
    except ClientError as e:
        logger.error(f"Failed to get key policy: {e}")
        raise


def put_key_policy(kms, policy):
    try:
        kms.put_key_policy(
            KeyId=KEY_ID, PolicyName="default", Policy=json.dumps(policy)
        )
        logger.info("Successfully updated key policy")
    except ClientError as e:
        logger.error(f"Failed to update key policy: {e}")
        raise


def handler(event, context):
    operation = event["operation"]
    logger.info(f"operation: {operation}")

    kms = kms_client_with_role(operation)

    cloudfront_distribution_ids = sorted(list(event["cloudfrontAccessors"].keys()))
    logger.info(f"cloudfrontAccessors: {'\n- '.join(cloudfront_distribution_ids)}")

    # First, remove the statements set by this stack
    key_policy = get_key_policy(kms)
    sid_prefix = f"{ACCESSOR_AWS_ID} {ACCESSOR_STACK_NAME} "
    key_policy["Statement"] = [
        statement
        for statement in key_policy["Statement"]
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
                "Resource": "*",
                "Condition": {
                    "StringEquals": {
                        "AWS:SourceArn": f"arn:aws:cloudfront::{ACCESSOR_AWS_ID}:distribution/{id}"
                    }
                },
            }
            key_policy["Statement"].append(statement)

    # Update the key policy
    put_key_policy(kms, key_policy)
