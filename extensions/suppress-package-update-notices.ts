import { InteractiveMode, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type InteractiveModeWithPackageUpdates = {
  checkForPackageUpdates: () => Promise<string[]>;
};

export default function (_pi: ExtensionAPI): void {
  const prototype = InteractiveMode.prototype as unknown as InteractiveModeWithPackageUpdates;

  if (typeof prototype.checkForPackageUpdates !== "function") return;

  prototype.checkForPackageUpdates = async () => [];
}
