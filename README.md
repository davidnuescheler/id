# Block Collection

This project contains code that is featured in the [AEM Block Collection](https://www.aem.live/developer/block-collection#block-collection-1) documentation.

## Environments
- Preview: https://main--aem-block-collection--adobe.hlx.page/
- Live: https://main--aem-block-collection--adobe.hlx.live/

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Video placeholders

For linked video files with a placeholder, the 16:9 hero dimensions remain fixed
while the video renders underneath the image. The image is hidden after playback
starts and the first video frame is submitted. With reduced-motion preferences,
the first paused frame is used instead. Browsers without video frame callbacks
use playback/data readiness followed by a paint opportunity. If autoplay fails,
the placeholder remains visible. YouTube and Vimeo embeds retain their existing
loading behavior.

## Local development

1. Create a new repository based on the `aem-block-collection` template and add a mountpoint in the `fstab.yaml`
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)
