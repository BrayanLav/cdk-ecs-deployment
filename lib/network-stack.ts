import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

///////////////////////////////////////////////////////////////////////////////
// Stack: Network (VPC)
///////////////////////////////////////////////////////////////////////////////
// Crea la VPC con subnets públicas y privadas.
// Equivalente a vpc.tf en Terraform.
//
// 🏆 Buena práctica CDK: Separar la red en su propio stack.
//    Así puedes actualizar el ECS sin tocar la VPC (y viceversa).
///////////////////////////////////////////////////////////////////////////////

export class NetworkStack extends cdk.Stack {
  // Exponer la VPC para que otros stacks la usen
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // CDK L2 Construct: crea VPC completa con subnets, NAT, IGW, routes
    // Con UNA línea tienes lo que en Terraform son ~50 líneas
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: 'ecs-platform-vpc',
      maxAzs: 2, // 2 AZs para alta disponibilidad (y ahorrar en NAT)
      natGateways: 1, // 1 NAT Gateway para ahorrar ($0.045/hr por cada uno)

      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Output: VPC ID
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });
  }
}
