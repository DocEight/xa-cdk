import path from "path";

import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { CrossAccountManager } from "../cross-account";
import { AllowCloudfrontBaseProps } from "../cross-account/xa-manager";

export interface AllowCloudfrontProps extends AllowCloudfrontBaseProps {
  keyId: string;
}

export interface CrossAccountKmsKeyManagerProps {
  xaKeyId: string;
  xaAwsId: string;
  managerTimeout?: number;
  callerTimeout?: number;
}

/**
 * CrossAccountKmsKeyManager creates a Lambda function and calls it at deployment
 * time using an AwsCustomResource (Lambda:InvokeFunction).
 *
 * @remarks
 * - `xaKeyId` should be the ID of the KMS key in the other account whose
 *   policy we want to manage.
 * - `xaAwsId` should be the ID of the AWS account the aforementioned key
 *   belongs to.
 * - `managerTimeout` is optional and specifies the number of seconds for the manager
 *   Lambda Function's timeout (defaults to 30).
 * - `callerTimeout` is optional and specifies the number of seconds for the
 *   AwsCustomResource's timeout (defaults to 30).
 * - To use this construct, first register the resources that need to access a given
 *   KMS key using one of the following static registry functions:
 *   - allowCloudfront(keyId, cloudfrontId)
 */
export class CrossAccountKmsKeyManager extends CrossAccountManager {
  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountKmsKeyManagerProps,
  ) {
    const {
      xaKeyId,
      xaAwsId,
      managerTimeout,
      callerTimeout, // default timeout of 3 seconds is awful short/fragile
    } = props;
    super(scope, id, {
      resourceIdentifier: xaKeyId,
      xaAwsId,
      managerTimeout,
      callerTimeout,
      subclassDir: path.join(__dirname, "lambda-code"),
    });
  }

  /**
   * Grant access to the given cross-account KMS key to the specified Cloudfront
   * Distribution ID
   * Optionally specify a list of actions
   * (default: [
   *  "kms:Decrypt",
   *  "kms:Encrypt",
   *  "kms:GenerateDataKey*",
   *  "kms:DescribeKey"
   * ])
   */
  public static allowCloudfront(props: AllowCloudfrontProps) {
    const {
      scope,
      distributionId,
      keyId,
      actions = [
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:GenerateDataKey*",
        "kms:DescribeKey",
      ],
    } = props;
    const stack = Stack.of(scope);
    const manager = this;
    super.registerCloudfrontAccessor({
      stack,
      manager,
      targetIdentifier: keyId,
      distributionId,
      actions,
    });
  }
}
