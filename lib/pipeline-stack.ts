import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import { Construct } from 'constructs';

///////////////////////////////////////////////////////////////////////////////
// Stack: CI/CD Pipeline (CodePipeline + CodeBuild)
///////////////////////////////////////////////////////////////////////////////
// Pipeline que:
// 1. Detecta push en GitHub (source)
// 2. Buildea la imagen Docker (CodeBuild)
// 3. Pushea a ECR (registry)
// 4. Actualiza el servicio ECS (deploy)
//
// 🏆 Buena práctica: Pipeline como código (no configurar en la consola).
//    Si necesitas recrear el pipeline, solo haces cdk deploy.
///////////////////////////////////////////////////////////////////////////////

interface PipelineStackProps extends cdk.StackProps {
  ecsService: ecs.FargateService;
  ecsCluster: ecs.Cluster;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    // ECR Repository (donde se guardan las imágenes Docker)
    const ecrRepo = new ecr.Repository(this, 'AppRepo', {
      repositoryName: 'web-app',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // Limpiar imágenes viejas automáticamente (no acumular basura)
      lifecycleRules: [
        {
          maxImageCount: 10, // Mantener solo las últimas 10 imágenes
          description: 'Keep only last 10 images',
        },
      ],
    });

    // CodeBuild Project (buildea Docker y pushea a ECR)
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'web-app-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true, // Necesario para docker build
      },
      environmentVariables: {
        ECR_REPO_URI: { value: ecrRepo.repositoryUri },
        AWS_ACCOUNT_ID: { value: this.account },
        AWS_REGION: { value: this.region },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com',
              'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
              'IMAGE_TAG=${COMMIT_HASH:=latest}',
            ],
          },
          build: {
            commands: [
              'echo Building Docker image...',
              'docker build -t $ECR_REPO_URI:$IMAGE_TAG -t $ECR_REPO_URI:latest ./app/',
            ],
          },
          post_build: {
            commands: [
              'echo Pushing Docker image to ECR...',
              'docker push $ECR_REPO_URI:$IMAGE_TAG',
              'docker push $ECR_REPO_URI:latest',
              // Generar archivo para el deploy stage
              'printf \'[{"name":"web","imageUri":"%s"}]\' $ECR_REPO_URI:$IMAGE_TAG > imagedefinitions.json',
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
    });

    // Dar permisos a CodeBuild para pushear a ECR
    ecrRepo.grantPullPush(buildProject);

    // Pipeline
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'web-app-pipeline',
      stages: [
        // Stage 1: Source (GitHub)
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: 'GitHub_Source',
              // ⚠️ CONFIGURAR: Crear un GitHub connection en la consola primero
              // Settings → Developer settings → Personal access tokens
              oauthToken: cdk.SecretValue.secretsManager('github-token'),
              owner: 'TU_USUARIO', // ← CAMBIAR
              repo: 'cdk-ecs-deployment', // ← CAMBIAR si renombraste
              branch: 'main',
              output: sourceOutput,
            }),
          ],
        },
        // Stage 2: Build (Docker build + push ECR)
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Docker_Build',
              project: buildProject,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        // Stage 3: Deploy (actualizar ECS service)
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: 'Deploy_ECS',
              service: props.ecsService,
              input: buildOutput,
              // Rolling deployment (sin downtime)
              deploymentTimeout: cdk.Duration.minutes(10),
            }),
          ],
        },
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'EcrRepoUri', {
      value: ecrRepo.repositoryUri,
      description: 'URI del repositorio ECR',
    });
  }
}
