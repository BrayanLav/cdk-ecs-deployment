# CDK ECS Deployment

Infraestructura ECS Fargate con AWS CDK (TypeScript) y CI/CD con GitHub Actions.
Push a main → build Docker → push ECR → deploy en ECS automáticamente.

## Arquitectura

```
┌──────────────┐     ┌──────────────────────────────────────────────────────┐
│   GitHub     │     │                    AWS                                │
│              │     │                                                      │
│  ┌────────┐  │     │  ┌─────────┐   ┌─────────┐   ┌──────────────────┐  │
│  │  Push  │──┼────►│  │CodeBuild│──►│   ECR   │──►│   ECS Fargate    │  │
│  │  main  │  │     │  │(build)  │   │(imagen) │   │  (containers)    │  │
│  └────────┘  │     │  └─────────┘   └─────────┘   └────────┬─────────┘  │
│              │     │                                        │            │
└──────────────┘     │                               ┌────────▼─────────┐  │
                     │                               │       ALB        │  │
                     │                               │ (Load Balancer)  │  │
                     │                               └────────┬─────────┘  │
                     └────────────────────────────────────────┼────────────┘
                                                              │
                                                         Internet
                                                    (URL pública de AWS)
```

## 💰 Costos

| Recurso | Costo/hora | Free tier? |
|---------|-----------|-----------|
| ECS Fargate (0.25 vCPU, 0.5GB) x2 tasks | $0.02 | ❌ |
| ALB (Application Load Balancer) | $0.023 | ❌ |
| ECR (500MB imágenes) | $0 | ✅ 500MB gratis |
| CodeBuild (100 min/mes) | $0 | ✅ 100 min gratis |
| **Total** | **~$0.04/hr** | **~$0.35/día (8h)** |

> 💡 ECS Fargate es MÁS BARATO que EKS ($0 de control plane vs $0.10/hr de EKS).
> Para apps simples sin necesidad de Kubernetes, ECS es la mejor opción.

## Qué vas a aprender

- Qué es AWS CDK y cómo se diferencia de Terraform
- Qué es ECS Fargate (containers sin Kubernetes)
- Cómo crear un pipeline CI/CD con CodeBuild + CodePipeline
- Cómo buildear y pushear imágenes Docker a ECR
- Cómo hacer rolling deployments sin downtime
- Constructs L1, L2 y L3 en CDK
- Buenas prácticas de CDK (stacks separados, constructs reutilizables)

## Prerequisitos

- Node.js >= 18 (CDK usa TypeScript/JavaScript)
- AWS CLI configurado
- AWS CDK CLI: `npm install -g aws-cdk`
- Docker instalado (para build local)
- Cuenta GitHub (para el CI/CD)

## Quick Start

```bash
# Instalar dependencias
npm install

# Bootstrap CDK (solo la primera vez por cuenta/región)
cdk bootstrap aws://TU_ACCOUNT_ID/us-east-1

# Ver qué se va a crear
cdk diff

# Desplegar
cdk deploy --all

# DESTRUIR cuando termines
cdk destroy --all
```

## Estructura del Proyecto

```
cdk-ecs-deployment/
├── bin/
│   └── app.ts                    # Entry point de CDK
├── lib/
│   ├── constructs/               # Constructs reutilizables (como módulos en Terraform)
│   │   ├── ecs-service.ts        # Construct: ECS Service + Task + ALB
│   │   └── pipeline.ts           # Construct: CodePipeline + CodeBuild
│   ├── network-stack.ts          # Stack: VPC + subnets
│   ├── ecs-cluster-stack.ts      # Stack: ECS Cluster + Service
│   └── pipeline-stack.ts         # Stack: CI/CD Pipeline
├── app/
│   ├── Dockerfile                # App de ejemplo (Node.js)
│   ├── server.js
│   └── package.json
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions (alternativa a CodePipeline)
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md
```

## CDK vs Terraform: ¿Cuándo usar cuál?

| Aspecto | CDK | Terraform |
|---------|-----|-----------|
| Lenguaje | TypeScript, Python, Java, Go | HCL (lenguaje propio) |
| Abstracción | Alta (L2/L3 constructs) | Media (módulos) |
| Multi-cloud | ❌ Solo AWS | ✅ AWS, Azure, GCP |
| Loops/Condiciones | Nativo del lenguaje | Limitado (count, for_each) |
| State | CloudFormation (AWS lo gestiona) | tfstate (tú lo gestionas) |
| Velocidad de deploy | Más lento (CloudFormation) | Más rápido (API directa) |
| Curva de aprendizaje | Necesitas saber programar | Más fácil para empezar |

**Regla general:**
- CDK → cuando tu equipo son developers y todo es AWS
- Terraform → cuando necesitas multi-cloud o tu equipo es de infra

---

## Paso a paso detallado

### Paso 1: Entender CDK

CDK (Cloud Development Kit) te permite definir infraestructura AWS usando
un lenguaje de programación real (TypeScript en nuestro caso).

```typescript
// Esto en CDK:
const vpc = new ec2.Vpc(this, 'MyVpc', { maxAzs: 2 });

// Es equivalente a esto en Terraform:
// module "vpc" {
//   source = "terraform-aws-modules/vpc/aws"
//   azs    = ["us-east-1a", "us-east-1b"]
// }
```

**Conceptos clave:**
- **App** → El proyecto completo
- **Stack** → Un grupo de recursos (como un archivo .tf)
- **Construct** → Un componente reutilizable (como un módulo de Terraform)
  - **L1** → Mapeo 1:1 con CloudFormation (bajo nivel)
  - **L2** → Abstracción con defaults inteligentes (lo que más usas)
  - **L3** → Patrones completos (VPC + ECS + ALB en una línea)

> **🏆 Buena práctica CDK: Separar en Stacks por lifecycle.**
>
> Un Stack para la red (VPC), otro para el cluster (ECS), otro para el pipeline.
> Así puedes actualizar el pipeline sin tocar la red.

### Paso 2: Instalar CDK

```bash
# Instalar CDK CLI globalmente
npm install -g aws-cdk

# Verificar
cdk --version

# Instalar dependencias del proyecto
cd cdk-ecs-deployment/
npm install
```

### Paso 3: Bootstrap (solo una vez)

CDK necesita un bucket S3 y roles IAM para funcionar. El bootstrap los crea:

```bash
cdk bootstrap aws://TU_ACCOUNT_ID/us-east-1
```

> Solo se hace UNA VEZ por cuenta/región. Si ya lo hiciste antes, no pasa nada.

### Paso 4: Revisar el código

Lee los archivos en `lib/` de arriba a abajo. Los comentarios explican todo.

### Paso 5: Desplegar

```bash
# Ver qué va a crear (como terraform plan)
cdk diff

# Desplegar todo
cdk deploy --all
# CDK te pregunta si aceptas los cambios de IAM → yes
```

### Paso 6: Probar

```bash
# CDK muestra la URL del ALB en los outputs
# Abrir en el navegador
```

### Paso 7: Destruir

```bash
cdk destroy --all
```
