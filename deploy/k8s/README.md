# Running the MCP server on Kubernetes

The HTTP connector (`build/connector.js`, what the image runs) is stateless: every
request builds its own MCP server and transport and throws them away
(`sessionIdGenerator: undefined`). There is no session to pin, so replicas scale
freely and need no affinity.

It also holds **no credential of its own**. Each request carries the caller's
BlendVision API token, so nothing here needs a Secret.

## Deploy

```bash
# point at a published image, then apply
cd deploy/k8s
kubectl apply -k .
```

To pin a specific tag, edit `images[0].newTag` in `kustomization.yaml` (or
`kustomize edit set image ghcr.io/blendvision/mcp-server:v0.5.0`).

Images are published to `ghcr.io/blendvision/mcp-server` by
`.github/workflows/docker-publish.yml` on every push to `main` and every `v*`
tag. To use a different registry (ECR, for instance), retag and push the same
image and change `images[0].name`.

## Calling it

```bash
curl -X POST https://<host>/mcp \
  -H 'Authorization: Bearer <api-token>' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The organization is taken from `?org_id=<org>` when a tool call does not carry
`orgId` of its own.

## Exposure

`ingress.yaml` assumes an nginx ingress controller and a placeholder host — set
`ingressClassName`, `host` and TLS to match your cluster. On EKS with the AWS
load balancer controller it is roughly:

```yaml
metadata:
  annotations:
    alb.ingress.kubernetes.io/scheme: internal
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: <acm-arn>
spec:
  ingressClassName: alb
```

If you would rather not expose it at all, drop `ingress.yaml` from
`kustomization.yaml` and reach the Service in-cluster or over
`kubectl port-forward`.

**Tokens in URLs.** The endpoint also accepts `/mcp/<token>` and `?token=<token>`
for clients that cannot set headers. Both forms put a live API token into ingress
access logs. Prefer `Authorization: Bearer`, and scrub the other two forms in
your log configuration if clients still use them.

## Scaling

CPU-bound and stateless, so a plain HPA works once metrics-server is available:

```bash
kubectl autoscale deployment blendvision-mcp-server --cpu-percent=70 --min=2 --max=10
```
