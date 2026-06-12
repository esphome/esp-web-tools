import { Manifest } from "../const";

export const downloadManifest = async (manifestPath: string) => {
  const manifestURL = new URL(manifestPath, location.toString()).toString();
  const resp = await fetch(manifestURL);
  const manifest: Manifest = await resp.json();

  if ("new_install_skip_erase" in manifest) {
    console.warn(
      'Manifest option "new_install_skip_erase" is deprecated. Use "new_install_prompt_erase" instead.',
    );
    if (manifest.new_install_skip_erase) {
      manifest.new_install_prompt_erase = true;
    }
  }

  for (const build of manifest.builds) {
    if (
      build.flashSizeMB != null &&
      (typeof build.flashSizeMB !== "number" || build.flashSizeMB <= 0)
    ) {
      console.warn(
        `Manifest build for ${build.chipFamily} has invalid flashSizeMB: ${build.flashSizeMB}. Ignoring.`,
      );
      delete build.flashSizeMB;
    }
    if (
      build.psramSizeMB != null &&
      (typeof build.psramSizeMB !== "number" || build.psramSizeMB <= 0)
    ) {
      console.warn(
        `Manifest build for ${build.chipFamily} has invalid psramSizeMB: ${build.psramSizeMB}. Ignoring.`,
      );
      delete build.psramSizeMB;
    }
  }

  return manifest;
};
