---
sidebar_position: 50
title: Self-hosting
description: Learn how to self-host dodoguard using Docker, Docker Compose, or Helm. This comprehensive guide walks you through setup, configuration, and troubleshooting.
keywords:
  - AI testing
  - configuration
  - Docker
  - Docker Compose
  - Helm
  - Kubernetes
  - LLM eval
  - LLM evaluation
  - dodoguard
  - self-hosting
  - setup guide
  - team collaboration
---

# Self-hosting DodoGuard

DodoGuard provides a basic Docker image that allows you to host a server that stores evals. This guide covers various deployment methods.

Self-hosting enables you to:

- Share evals to a private instance
- Run evals in your CI/CD pipeline and aggregate results
- Keep sensitive data off your local machine

:::caution Enterprise Customers
If you are an enterprise customer, please do not install this version. Contact us instead for credentials for the enterprise image.
:::

The self-hosted app is an Express server serving the web UI and API.

:::warning
**Self-hosting is not recommended for production use cases.**

- Uses a local SQLite database that requires manual persistence management and cannot be shared across replicas
- Built for individual or experimental usage
- No multi-team support or role-based access control.
- No support for horizontal scalability. Evaluation jobs live in each server's memory and multiple pods cannot share the SQLite database, so running more than one replica (for example in Kubernetes) will lead to "Job not found" errors.
- No built-in authentication or SSO capabilities

For production deployments requiring horizontal scaling, shared databases, or multi-team support, see our [Enterprise platform](/docs/enterprise/).
:::

## Method 1: Using Pre-built Docker Images (Recommended Start)

Get started quickly using a pre-built image.

### 1. Pull the Image

Pull the latest image or pin to a specific version (e.g., `0.109.1`):

```bash
# Pull latest
docker pull ghcr.io/dodoguard/dodoguard:latest

# Or pull a specific version
# docker pull ghcr.io/dodoguard/dodoguard:0.109.1
```

### 2. Run the Container

Run the container, mapping a local directory for data persistence:

```bash
docker run -d \
  --name dodoguard_container \
  -p 3000:3000 \
  -v /path/to/local_dodoguard:/home/dodoguard/.dodoguard \
  -e OPENAI_API_KEY=sk-abc123 \
  ghcr.io/dodoguard/dodoguard:latest
```

:::info
`~/.dodoguard/` is the default data directory.
:::

**Key Parameters:**

- **`-d`**: Run in detached mode (background).
- **`--name dodoguard_container`**: Assign a name to the container.
- **`-p 3000:3000`**: Map host port 3000 to container port 3000.
- **`-v /path/to/local_dodoguard:/home/dodoguard/.dodoguard`**: **Crucial for persistence.** Maps the container's data directory (`/home/dodoguard/.dodoguard`, containing `dodoguard.db`) to your local filesystem. Replace `/path/to/local_dodoguard` with your preferred host path (e.g., `./dodoguard_data`). **Data will be lost if this volume mapping is omitted.**
- **`-e OPENAI_API_KEY=sk-abc123`**: Example of setting an environment variable. Add necessary API keys here so users can run evals directly from the web UI. Replace `sk-abc123` with your actual key.

Access the UI at `http://localhost:3000`.

## Method 2: Using Docker Compose

For managing multi-container setups or defining configurations declaratively, use Docker Compose.

### 1. Create `docker-compose.yml`

Create a `docker-compose.yml` file in your project directory:

```yaml title="docker-compose.yml"
version: '3.8'

services:
  dodoguard_container: # Consistent service and container name
    image: ghcr.io/dodoguard/dodoguard:latest # Or pin to a specific version tag
    ports:
      - '3000:3000' # Map host port 3000 to container port 3000
    volumes:
      # Map host directory to container data directory for persistence
      # Create ./dodoguard_data on your host first!
      - ./dodoguard_data:/home/dodoguard/.dodoguard
    environment:
      # Optional: Adjust chunk size for large evals (See Troubleshooting)
      - DODOGUARD_SHARE_CHUNK_SIZE=10
      # Add other necessary environment variables (e.g., API keys)
      - OPENAI_API_KEY=your_key_here
      # Example: Google API Key
      # - GOOGLE_API_KEY=your_google_key_here
# Optional: Define a named volume managed by Docker (alternative to host path mapping)
# volumes:
#   dodoguard_data:
#     driver: local
# If using a named volume, change the service volume mapping to:
#     volumes:
#       - dodoguard_data:/home/dodoguard/.dodoguard
```

:::info Using Host Paths vs. Named Volumes
The example above uses a host path mapping (`./dodoguard_data:/home/dodoguard/.dodoguard`) which clearly maps to a directory you create. Alternatively, you can use Docker named volumes (uncomment the `volumes:` section and adjust the service `volumes:`).
:::

### 2. Create Host Directory (if using host path)

If you used `./dodoguard_data` in the `volumes` mapping, create it:

```bash
mkdir -p ./dodoguard_data
```

### 3. Run with Docker Compose

Start the container in detached mode:

```bash
docker compose up -d
```

Stop the container (data remains in `./dodoguard_data` or the named volume):

```bash
docker compose stop
```

Stop and remove the container (data remains):

```bash
docker compose down
```

## Method 3: Using Kubernetes with Helm

:::warning
Helm support is currently experimental. Please report any issues you encounter.
:::

Deploy dodoguard to Kubernetes using the provided Helm chart located within the main dodoguard repository.

:::info
Keep `replicaCount: 1` (the default) as the self-hosted server uses a local SQLite database and in-memory job queue that cannot be shared across multiple replicas.
:::

### Prerequisites

- A Kubernetes cluster (e.g., Minikube, K3s, GKE, EKS, AKS)
- Helm v3 installed (`brew install helm` or see [Helm docs](https://helm.sh/docs/intro/install/))
- `kubectl` configured to connect to your cluster
- Git installed

### Installation

1. **Clone the dodoguard Repository:**
   If you haven't already, clone the main dodoguard repository:

   ```bash
   git clone https://github.com/dodoguard/dodoguard.git
   cd dodoguard
   ```

2. **Install the Chart:**
   From the root of the cloned repository, install the chart using its local path. Provide a release name (e.g., `my-dodoguard`):
   ```bash
   # Install using the default values
   helm install my-dodoguard ./helm/chart/dodoguard
   ```

### Configuration

The Helm chart uses PersistentVolumeClaims (PVCs) for data persistence. By default, it creates a PVC named `dodoguard` requesting 1Gi of storage using the default StorageClass.

Customize the installation using a `values.yaml` file or `--set` flags.

**Example (`my-values.yaml`):**

```yaml title="my-values.yaml"
image:
  tag: v0.54.0 # Pin to a specific version

persistentVolumeClaims:
  - name: dodoguard
    size: 10Gi # Increase storage size
    # Optional: Specify a StorageClass if the default is not suitable
    # storageClassName: my-ssd-storage

service:
  type: LoadBalancer # Expose via LoadBalancer (adjust based on your cluster/needs)

# Optional: Configure ingress if you have an ingress controller
# ingress:
#   enabled: true
#   className: "nginx" # Or your ingress controller class
#   hosts:
#     - host: dodoguard.example.com
#       paths:
#         - path: /
#           pathType: ImplementationSpecific
#   tls: []
#   #  - secretName: dodoguard-tls
#   #    hosts:
#   #      - dodoguard.example.com
```

Install with custom values:

```bash
# Ensure you are in the root of the cloned dodoguard repository
helm install my-dodoguard ./helm/chart/dodoguard -f my-values.yaml
```

Or use `--set` for quick changes:

```bash
# Ensure you are in the root of the cloned dodoguard repository
helm install my-dodoguard ./helm/chart/dodoguard \
  --set image.tag=0.109.1 \
  --set service.type=NodePort
```

Refer to the [chart's `values.yaml`](https://github.com/dodoguard/dodoguard/blob/main/helm/chart/dodoguard/values.yaml) for all available options.

### Persistence Considerations

Ensure your Kubernetes cluster has a default StorageClass configured, or explicitly specify a `storageClassName` in your values that supports `ReadWriteOnce` access mode for the PVC.

## Alternative: Building from Source

If you want to build the image yourself:

### 1. Clone the Repository

```sh
git clone https://github.com/dodoguard/dodoguard.git
cd dodoguard
```

### 2. Build the Docker Image

```sh
# Build for your current architecture
docker build -t dodoguard:custom .

# Or build for a specific platform like linux/amd64
# docker build --platform linux/amd64 -t dodoguard:custom .
```

### 3. Run the Custom Docker Container

Use the same `docker run` command as in Method 1, but replace the image name:

```bash
docker run -d \
  --name dodoguard_custom_container \
  -p 3000:3000 \
  -v /path/to/local_dodoguard:/home/dodoguard/.dodoguard \
  dodoguard:custom
```

Remember to include the volume mount (`-v`) for data persistence.

## Configuring the CLI

When self-hosting, configure the `dodoguard` CLI to communicate with your instance instead of the default cloud service. This is necessary for commands like `dodoguard share`.

Set these environment variables before running `dodoguard` commands:

```sh
export DODOGUARD_REMOTE_API_BASE_URL=http://your-server-address:3000
export DODOGUARD_REMOTE_APP_BASE_URL=http://your-server-address:3000
```

Replace `http://your-server-address:3000` with the actual URL of your self-hosted instance (e.g., `http://localhost:3000` if running locally).

After configuring the CLI, you need to explicitly upload eval results to your self-hosted instance:

1. Run `dodoguard eval` to execute your eval
2. Run `dodoguard share` to upload the results
3. Or use `dodoguard eval --share` to do both in one command

Alternatively, configure these URLs permanently in your `dodoguardconfig.yaml`:

```yaml title="dodoguardconfig.yaml"
# Configure sharing to your self-hosted instance
sharing:
  apiBaseUrl: http://your-server-address:3000
  appBaseUrl: http://your-server-address:3000

prompts:
  - 'Tell me about {{topic}}'

providers:
  - openai:o4-mini
# ... rest of config ...
```

### Configuration Priority

dodoguard resolves the sharing target URL in this order (highest priority first):

1. Config file (`sharing.apiBaseUrl` and `sharing.appBaseUrl`)
2. Environment variables (`DODOGUARD_REMOTE_API_BASE_URL`, `DODOGUARD_REMOTE_APP_BASE_URL`)
3. Cloud configuration (set via `dodoguard auth login`)
4. Default dodoguard cloud URLs

### Expected URL Format

When configured correctly, your self-hosted server handles requests like:

- **API Endpoint**: `http://your-server:3000/api/eval`
- **Web UI Link**: `http://your-server:3000/eval/{evalId}`

## Advanced Configuration

### Eval Storage Path

By default, dodoguard stores its SQLite database (`dodoguard.db`) in `/home/dodoguard/.dodoguard` _inside the container_. Ensure this directory is mapped to persistent storage using volumes (as shown in the Docker and Docker Compose examples) to save your evals across container restarts.

### Custom Config Directory

You can override the default internal configuration directory (`/home/dodoguard/.dodoguard`) using the `DODOGUARD_CONFIG_DIR` environment variable. If set, dodoguard uses this path _inside the container_ for both configuration files and the `dodoguard.db` database. You still need to map this custom path to a persistent volume.

**Example:** Store data in `/app/data` inside the container, mapped to `./my_custom_data` on the host.

```bash
# Create host directory
mkdir -p ./my_custom_data

# Run container
docker run -d --name dodoguard_container -p 3000:3000 \
  -v ./my_custom_data:/app/data \
  -e DODOGUARD_CONFIG_DIR=/app/data \
  ghcr.io/dodoguard/dodoguard:latest
```

## Specifications

### Client Requirements (Running `dodoguard` CLI)

- **OS**: Linux, macOS, Windows
- **CPU**: 2+ cores, 2.0GHz+ recommended
- **GPU**: Not required
- **RAM**: 4 GB+
- **Storage**: 10 GB+
- **Dependencies**: Node.js v20+, npm

### Server Requirements (Hosting the Web UI/API)

The server component is optional; you can run evals locally or in CI/CD without it.

**Host Machine:**

- **OS**: Any OS capable of running Docker/Kubernetes
- **CPU**: 4+ cores recommended
- **RAM**: 8GB+ (16GB recommended for heavy use)
- **Storage**: 100GB+ recommended for container volumes and database (SSD recommended for database volume)

## Troubleshooting

### Lost Data After Container Restart

**Problem**: Evals disappear after `docker compose down` or container restarts.

**Solution**: This indicates missing or incorrect volume mapping. Ensure your `docker run` command or `docker-compose.yml` correctly maps a host directory or named volume to `/home/dodoguard/.dodoguard` (or your `DODOGUARD_CONFIG_DIR` if set) inside the container. Review the `volumes:` section in the examples above.

### Results Not Appearing in Self-Hosted UI

**Problem**: Running `dodoguard eval` opens results at `localhost:15500` instead of showing them in the self-hosted UI.

**Solution**:

1. The local viewer (`localhost:15500`) is the default behavior when running `dodoguard eval`
2. To upload results to your self-hosted instance, run `dodoguard share` after eval
3. Configure your self-hosted instance using ONE of these methods:

   **Option A: Environment Variables (temporary)**

   ```bash
   export DODOGUARD_REMOTE_API_BASE_URL=http://your-server:3000
   export DODOGUARD_REMOTE_APP_BASE_URL=http://your-server:3000
   ```

   **Option B: Config File (permanent - recommended)**

   ```yaml title="dodoguardconfig.yaml"
   sharing:
     apiBaseUrl: http://your-server:3000
     appBaseUrl: http://your-server:3000
   ```

   Replace `your-server` with your actual server address (e.g., `192.168.1.100`, `dodoguard.internal.company.com`, etc.)

4. Then run: `dodoguard eval` followed by `dodoguard share`

:::tip What to Expect
After running `dodoguard share`, you should see output like:

```
View results: http://192.168.1.100:3000/eval/abc-123-def
```

This URL points to your self-hosted instance, not the local viewer.
:::

## See Also

- [Configuration Reference](../configuration/reference.md)
- [Command Line Interface](./command-line.md)
- [Sharing Results](./sharing.md)
