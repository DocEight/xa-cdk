// import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface CrossAccountProps {
  // Define construct properties here
}

export class CrossAccount extends Construct {

  constructor(scope: Construct, id: string, props: CrossAccountProps = {}) {
    super(scope, id);

    // Define construct contents here

    // example resource
    // const queue = new sqs.Queue(this, 'CrossAccountQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
