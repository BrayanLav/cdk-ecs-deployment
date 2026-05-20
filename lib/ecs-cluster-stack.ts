import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';

///////////////////////////////////////////////////////////////////////////////
// Stack: ECS Cluster + Fargate Service
///////////////////////////////////////////////////////////////////////////////
// Crea un cluster ECS con un servicio Fargate detrás de un ALB.
//
// 🏆 Buena práctica CDK: Usar L3 Constructs (patterns) para casos comunes.
//    ApplicationLoadBalancedFargateService crea en UNA línea:
//    - ECS Cluster
//    - Task Definition
//    - Fargate Service
//    - ALB + Target Group + Listener
//    - Security Groups
//    - CloudWatch Log Group
//    - Auto Scaling
///////////////////////////////////////////////////////////////////////////////

interface EcsClusterStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class EcsClusterStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: EcsClusterStackProps) {
    super(scope, id, props);

    // Crear cluster ECS (solo el cluster, no tiene nodos como EKS)
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: 'platform-ecs-cluster',
      vpc: props.vpc,
      containerInsights: true, // Métricas detalladas en CloudWatch
    });

    // Crear servicio Fargate con ALB (L3 Pattern - hace TODO por ti)
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      'Service',
      {
        cluster: this.cluster,
        serviceName: 'web-app',

        // Task Definition (qué container correr)
        taskImageOptions: {
          // Imagen de ejemplo (se reemplaza por el pipeline después)
          image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
          containerPort: 80,
          environment: {
            NODE_ENV: 'production',
            APP_VERSION: '1.0.0',
          },
        },

        // Recursos (Fargate cobra por esto)
        cpu: 256, // 0.25 vCPU
        memoryLimitMiB: 512, // 512 MB RAM

        // Réplicas
        desiredCount: 2,

        // ALB público (accesible desde internet)
        publicLoadBalancer: true,

        // Health check
        healthCheck: {
          command: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          retries: 3,
        },
      }
    );

    // Auto Scaling (escalar entre 2 y 6 tasks según CPU)
    const scaling = fargateService.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 6,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    this.service = fargateService.service;

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: 'URL del Application Load Balancer',
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: fargateService.service.serviceName,
      description: 'Nombre del servicio ECS',
    });
  }
}
