#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { EcsClusterStack } from '../lib/ecs-cluster-stack';
import { PipelineStack } from '../lib/pipeline-stack';

///////////////////////////////////////////////////////////////////////////////
// Entry Point de CDK
///////////////////////////////////////////////////////////////////////////////
// Aquí defines qué stacks crear y en qué orden.
// CDK resuelve las dependencias automáticamente (si un stack referencia
// un output de otro, CDK sabe que debe crear el primero primero).
///////////////////////////////////////////////////////////////////////////////

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Stack 1: Red (VPC)
const networkStack = new NetworkStack(app, 'NetworkStack', { env });

// Stack 2: ECS Cluster + Service + ALB
const ecsStack = new EcsClusterStack(app, 'EcsClusterStack', {
  env,
  vpc: networkStack.vpc,
});

// Stack 3: CI/CD Pipeline (CodePipeline + CodeBuild)
new PipelineStack(app, 'PipelineStack', {
  env,
  ecsService: ecsStack.service,
  ecsCluster: ecsStack.cluster,
});
