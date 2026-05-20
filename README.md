# CDK ECS Deployment

Desplegar una aplicación containerizada en ECS Fargate con un pipeline CI/CD
usando CodePipeline y CodeBuild. Todo definido con AWS CDK en TypeScript.

Al terminar vas a tener: una app corriendo en containers, accesible por URL pública,
que se actualiza automáticamente cada vez que haces push a GitHub.

---

## Antes de empezar: Costos

| Recurso | Costo/hora | Free tier? |
|---------|-----------|-----------|
| ECS Fargate (0.25 vCPU, 0.5GB) x2 tasks | $0.02 | ❌ |
| ALB (Application Load Balancer) | $0.023 | ❌ |
| ECR (500MB imágenes) | $0 | ✅ 500MB gratis |
| CodeBuild (100 min/mes) | $0 | ✅ 100 min gratis |
| NAT Gateway | $0.045 | ❌ |
| **Total** | **~$0.09/hr** | **~$0.70/día (8h)** |

> ⚠️ Ejecuta `cdk destroy --all` cuando termines.

---

## Paso 1: Entender qué vamos a crear

```
Lo que vas a tener al final:

┌─────────────────────────────────────────────────────────────────────┐
│                            AWS                                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  VPC (red privada)                                           │   │
│  │                                                             │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │  ECS Cluster                                          │   │   │
│  │  │                                                      │   │   │
│  │  │  ┌────────────┐  ┌────────────┐                     │   │   │
│  │  │  │  Task 1    │  │  Task 2    │  (2 copias de tu app)│   │   │
│  │  │  │  (container)│  │  (container)│                     │   │   │
│  │  │  └────────────┘  └────────────┘                     │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                          ▲                                   │   │
│  │                          │                                   │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │  ALB (Load Balancer)                                  │   │   │
│  │  │  URL: xxxxx.us-east-1.elb.amazonaws.com              │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ECR (Elastic Container Registry)                            │   │
│  │  Aquí se guardan tus imágenes Docker                        │   │
│  │  (como Docker Hub pero privado y de AWS)                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  CodePipeline + CodeBuild (CI/CD)                            │   │
│  │                                                             │   │
│  │  GitHub push → CodeBuild (docker build) → ECR → ECS deploy │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Explicación de cada pieza:**

| Componente | Qué es | Para qué sirve |
|-----------|--------|----------------|
| **VPC** | Tu red privada en AWS | Aislar tus recursos del resto de internet |
| **ECS Cluster** | Agrupación lógica de containers | Organizar tus servicios |
| **ECS Task** | Un container corriendo (como un pod en K8s) | Ejecutar tu app |
| **ECS Service** | Gestiona las tasks (mantiene 2 corriendo siempre) | Alta disponibilidad |
| **ALB** | Load Balancer que distribuye tráfico | URL pública + balanceo entre tasks |
| **ECR** | Registry privado de imágenes Docker | Guardar tus imágenes (como Docker Hub) |
| **CodePipeline** | Orquestador del CI/CD | Coordina los pasos del pipeline |
| **CodeBuild** | Ejecuta comandos (docker build, push) | Buildear tu imagen Docker |

**¿ECS vs EKS?**
- **ECS** = containers simples, sin Kubernetes, más fácil, más barato ($0 de control plane)
- **EKS** = Kubernetes completo, más poderoso, más complejo, $0.10/hr de control plane

Para apps simples (1-5 servicios), ECS es mejor. Para plataformas grandes (20+ servicios), EKS.

---

## Paso 2: Entender qué es CDK

CDK (Cloud Development Kit) es una alternativa a Terraform para definir infraestructura.
En vez de HCL (el lenguaje de Terraform), usas TypeScript (o Python, Java, Go).

```typescript
// CDK (TypeScript):
const vpc = new ec2.Vpc(this, 'MyVpc', { maxAzs: 2 });

// Equivalente en Terraform (HCL):
// module "vpc" {
//   source  = "terraform-aws-modules/vpc/aws"
//   azs     = ["us-east-1a", "us-east-1b"]
// }
```

**Conceptos clave de CDK:**

| Concepto | Qué es | Equivalente en Terraform |
|----------|--------|--------------------------|
| **App** | El proyecto completo | El directorio raíz |
| **Stack** | Un grupo de recursos que se despliegan juntos | Un archivo .tf |
| **Construct** | Un componente reutilizable | Un módulo |
| **L1 Construct** | Mapeo 1:1 con CloudFormation (bajo nivel) | `resource "aws_..."` |
| **L2 Construct** | Abstracción con defaults inteligentes | Módulo de la comunidad |
| **L3 Construct** | Patrón completo (VPC+ECS+ALB en 1 línea) | No existe equivalente |

> **🏆 Buena práctica CDK: Separar en Stacks por lifecycle.**
>
> Si metes todo en un solo Stack, un cambio en el pipeline requiere
> re-desplegar la VPC (riesgoso). Con stacks separados, cada uno se
> actualiza independientemente.

---

## Paso 3: Instalar herramientas

```bash
# Node.js (CDK está escrito en Node)
node --version  # Necesitas >= 18

# AWS CDK CLI
npm install -g aws-cdk
cdk --version   # Debe mostrar 2.x

# Docker (para buildear imágenes localmente)
docker --version

# AWS CLI (ya lo deberías tener)
aws sts get-caller-identity
```

Si no tienes Node.js: https://nodejs.org/ (descarga la versión LTS)

---

## Paso 4: Instalar dependencias del proyecto

```bash
cd cdk-ecs-deployment/
npm install
```

Esto descarga las librerías de CDK (`aws-cdk-lib`, `constructs`) definidas en `package.json`.

---

## Paso 5: Bootstrap CDK (solo la primera vez)

CDK necesita un bucket S3 y roles IAM para funcionar. El bootstrap los crea:

```bash
# Obtener tu Account ID
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap
cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

> Solo se hace UNA VEZ por cuenta/región. Si ya lo hiciste antes, no pasa nada.
> Crea un stack llamado `CDKToolkit` con un bucket S3 y roles IAM.

---

## Paso 6: Entender la app de ejemplo

Antes de desplegar la infra, mira qué app vamos a containerizar.

### `app/server.js` — Un servidor Node.js simple

```javascript
const server = http.createServer((req, res) => {
  // Endpoint de health check (ECS lo usa para saber si la app está viva)
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'healthy', version: VERSION }));
    return;
  }
  // Respuesta normal
  res.end(JSON.stringify({
    message: 'Desplegado con CDK + ECS Fargate + CodePipeline 🚀',
    version: VERSION,
  }));
});
```

### `app/Dockerfile` — Cómo se empaqueta la app

```dockerfile
# Multi-stage build (imagen final más pequeña)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup  # No correr como root
COPY --from=builder /app/node_modules ./node_modules
COPY server.js .
USER appuser
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost:80/health || exit 1
CMD ["node", "server.js"]
```

> **🏆 Buena práctica: Multi-stage build.**
>
> La primera etapa (`builder`) instala dependencias. La segunda etapa
> copia solo lo necesario. Resultado: imagen más pequeña y segura.

> **🏆 Buena práctica: No correr como root.**
>
> `USER appuser` hace que el proceso corra como usuario sin privilegios.
> Si alguien explota una vulnerabilidad, no tiene acceso root al container.

> **🏆 Buena práctica: HEALTHCHECK en el Dockerfile.**
>
> ECS usa esto para saber si el container está sano. Si falla 3 veces,
> ECS mata el container y crea uno nuevo.

---

## Paso 7: Probar la app localmente con Docker

```bash
cd app/

# Buildear la imagen
docker build -t web-app .

# Correr localmente
docker run -p 8080:80 web-app

# En otra terminal, probar
curl http://localhost:8080
# {"message":"Desplegado con CDK + ECS Fargate + CodePipeline 🚀","version":"1.0.0",...}

curl http://localhost:8080/health
# {"status":"healthy","version":"1.0.0"}

# Parar el container
docker stop $(docker ps -q)
cd ..
```

Si funciona localmente, va a funcionar en ECS.

---

## Paso 8: Entender los Stacks de CDK

Abre los archivos en `lib/` y lee los comentarios. Resumen:

### `lib/network-stack.ts` — La VPC

Crea una VPC con subnets públicas y privadas. Una sola línea de CDK:

```typescript
this.vpc = new ec2.Vpc(this, 'Vpc', {
  maxAzs: 2,           // 2 Availability Zones
  natGateways: 1,      // 1 NAT Gateway (para ahorrar)
});
```

Eso crea: VPC + 4 subnets + Internet Gateway + NAT Gateway + Route Tables.
En Terraform serían ~50 líneas. En CDK es 1 construct.

### `lib/ecs-cluster-stack.ts` — ECS + ALB

Usa un L3 Construct (patrón completo):

```typescript
new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
  cluster: this.cluster,
  taskImageOptions: {
    image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
    containerPort: 80,
  },
  cpu: 256,            // 0.25 vCPU
  memoryLimitMiB: 512, // 512 MB RAM
  desiredCount: 2,     // 2 tasks (alta disponibilidad)
  publicLoadBalancer: true,
});
```

Esa UNA llamada crea: ECS Service + Task Definition + ALB + Target Group +
Listener + Security Groups + CloudWatch Logs + IAM Roles. Todo con buenas prácticas.

### `lib/pipeline-stack.ts` — CI/CD

Crea:
- **ECR Repository** — donde se guardan las imágenes Docker
- **CodeBuild Project** — buildea Docker y pushea a ECR
- **CodePipeline** — orquesta: Source (GitHub) → Build → Deploy (ECS)

---

## Paso 9: Crear el token de GitHub para CodePipeline

CodePipeline necesita acceso a tu repo de GitHub. Hay que crear un token y guardarlo en AWS Secrets Manager:

```bash
# 1. Ir a GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
# 2. Generate new token (classic)
# 3. Scopes: repo (full control) + admin:repo_hook
# 4. Copiar el token

# 5. Guardarlo en AWS Secrets Manager
aws secretsmanager create-secret \
  --name github-token \
  --secret-string "ghp_TU_TOKEN_AQUI" \
  --region us-east-1
```

> **🏆 Buena práctica: Secrets en Secrets Manager, nunca en código.**
>
> El token de GitHub da acceso a tus repos. Si lo pones en el código
> y lo pusheas, cualquiera puede clonar tus repos privados.

---

## Paso 10: Configurar tu usuario de GitHub en el código

Edita `lib/pipeline-stack.ts` y cambia:

```typescript
owner: 'TU_USUARIO',           // ← Tu usuario de GitHub
repo: 'cdk-ecs-deployment',   // ← Nombre del repo
```

---

## Paso 11: Desplegar la infraestructura

```bash
# Ver qué va a crear (como terraform plan)
cdk diff

# Desplegar todos los stacks
cdk deploy --all
```

CDK te pregunta si aceptas los cambios de IAM y Security Groups → escribe `y`.

⏱️ **Tiempo: ~5-8 minutos** (el ALB y el NAT Gateway tardan un poco)

Al terminar, CDK muestra los outputs:
```
Outputs:
EcsClusterStack.LoadBalancerDNS = xxxxx.us-east-1.elb.amazonaws.com
PipelineStack.EcrRepoUri = 123456789.dkr.ecr.us-east-1.amazonaws.com/web-app
```

---

## Paso 12: Probar la app desplegada

```bash
# Copiar la URL del ALB del output anterior
curl http://xxxxx.us-east-1.elb.amazonaws.com
```

Debe responder con el JSON de la app. También puedes abrirlo en el navegador.

> Si da error 503, espera 1-2 minutos. ECS está arrancando los containers.

---

## Paso 13: Buildear y pushear tu imagen a ECR manualmente (primera vez)

La primera vez necesitas pushear una imagen manualmente porque el pipeline
todavía no ha corrido:

```bash
# Login en ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Buildear
docker build -t web-app ./app/

# Taggear para ECR
docker tag web-app:latest $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/web-app:latest

# Pushear
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/web-app:latest

# Actualizar el servicio ECS para que use la nueva imagen
aws ecs update-service --cluster platform-ecs-cluster --service web-app --force-new-deployment --region us-east-1
```

Espera ~2 minutos y prueba de nuevo:
```bash
curl http://xxxxx.us-east-1.elb.amazonaws.com
# {"message":"Desplegado con CDK + ECS Fargate + CodePipeline 🚀",...}
```

---

## Paso 14: Probar el pipeline (CI/CD automático)

Ahora que el pipeline está configurado, cada push a `main` triggerea el deploy:

```bash
# Cambiar algo en la app
# Editar app/server.js → cambiar el mensaje

git add .
git commit -m "Update app message"
git push

# El pipeline se activa automáticamente:
# 1. CodePipeline detecta el push
# 2. CodeBuild buildea la imagen Docker
# 3. CodeBuild pushea a ECR
# 4. CodePipeline actualiza el servicio ECS
# 5. ECS hace rolling deployment (sin downtime)
```

Puedes ver el progreso en:
- AWS Console → CodePipeline → web-app-pipeline

⏱️ El pipeline completo tarda ~3-5 minutos.

---

## Paso 15: Verificar el Auto Scaling

El servicio tiene auto scaling configurado (2-6 tasks según CPU):

```bash
# Ver cuántas tasks hay corriendo
aws ecs describe-services --cluster platform-ecs-cluster --services web-app \
  --query 'services[0].runningCount' --output text
# Debe ser 2 (el mínimo)
```

Si la CPU sube de 70%, ECS crea más tasks automáticamente (hasta 6).

---

## ✅ Lab completado

Ahora tienes:
- ✅ VPC con subnets públicas y privadas
- ✅ ECS Cluster con Fargate (sin gestionar servidores)
- ✅ 2 tasks corriendo tu app (alta disponibilidad)
- ✅ ALB con URL pública (accesible desde cualquier navegador)
- ✅ ECR con tu imagen Docker
- ✅ Pipeline CI/CD: push → build → deploy automático
- ✅ Auto Scaling (2-6 tasks según carga)
- ✅ Health checks (ECS reinicia containers que fallan)

---

## 🔴 Destruir cuando termines

```bash
# Primero vaciar el ECR (CDK no puede borrar repos con imágenes)
aws ecr delete-repository --repository-name web-app --force --region us-east-1

# Destruir toda la infra
cdk destroy --all
```

---

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `cdk bootstrap` falla | Sin permisos de admin | Verificar IAM |
| `CDKToolkit` ya existe | Ya hiciste bootstrap antes | No pasa nada, continuar |
| Pipeline falla en Source | Token de GitHub inválido | Recrear secret en Secrets Manager |
| 503 en el ALB | Tasks no están healthy | Esperar 2 min o ver logs en CloudWatch |
| `docker push` access denied | No hiciste login en ECR | Ejecutar `aws ecr get-login-password...` |
| `cdk destroy` falla en ECR | Repo tiene imágenes | Borrar repo manualmente primero |
