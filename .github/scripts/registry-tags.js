'use strict';
// Fail closed on authentication, network or ambiguous errors. Never overwrite a version tag.
async function requireAbsent(image, tags, credential, request = fetch) {
  if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(image)) throw new Error('Invalid GHCR image.');
  const response = await request(`https://ghcr.io/token?service=ghcr.io&scope=repository:${image}:pull`, {
    headers: {Authorization:`Basic ${Buffer.from(credential).toString('base64')}`}, signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Registry authentication could not be verified.');
  const {token} = await response.json();
  if (!token) throw new Error('Registry did not return a scoped token.');
  for (const tag of tags) {
    const manifest = await request(`https://ghcr.io/v2/${image}/manifests/${encodeURIComponent(tag)}`, {
      method:'HEAD', headers:{Authorization:`Bearer ${token}`, Accept:'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'}, signal:AbortSignal.timeout(20000)
    });
    if (manifest.status === 200) throw new Error('A version/commit image tag already exists; refusing overwrite.');
    if (manifest.status !== 404) throw new Error('Registry tag absence could not be verified.');
  }
}
module.exports = {requireAbsent};
