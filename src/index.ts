/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author akashranjan <akash-ranjan>
 */

import { PDBeStructureQualityReport } from "molstar/lib/extensions/pdbe";
import { EmptyLoci } from "molstar/lib/mol-model/loci";
import { StructureSelection } from "molstar/lib/mol-model/structure";
import { AnimateModelIndex } from "molstar/lib/mol-plugin-state/animation/built-in/model-index";
import { BuiltInTrajectoryFormat } from "molstar/lib/mol-plugin-state/formats/trajectory";
import { createPlugin } from "molstar/lib/mol-plugin-ui";
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import { PluginCommands } from "molstar/lib/mol-plugin/commands";
import { Script } from "molstar/lib/mol-script/script";
import { Asset } from "molstar/lib/mol-util/assets";
import { Color } from "molstar/lib/mol-util/color";
import { StripedResidues } from "./coloring";
import { CustomToastMessage } from "./controls";
import { CustomColorThemeProvider } from "./custom-theme";
import "molstar/build/viewer/molstar.css";
// import "./index.html";
import {
  buildStaticSuperposition,
  dynamicSuperpositionTest,
  StaticSuperpositionTestData
} from "./superposition";
// require("mol-plugin-ui/skin/light.scss");

type LoadParams = {
  url: string;
  format?: BuiltInTrajectoryFormat;
  isBinary?: boolean;
  assemblyId?: string;
};

class BasicWrapper {
  plugin: PluginUIContext;

  init(target: string | HTMLElement) {
    this.plugin = createPlugin(
      typeof target === "string" ? document.getElementById(target)! : target,
      {
        ...DefaultPluginUISpec(),
        layout: {
          initial: {
            isExpanded: false,
            showControls: false
          }
        },
        components: {
          remoteState: "none"
        }
      }
    );

    this.plugin.representation.structure.themes.colorThemeRegistry.add(
      StripedResidues.colorThemeProvider!
    );
    this.plugin.representation.structure.themes.colorThemeRegistry.add(
      CustomColorThemeProvider
    );
    this.plugin.managers.lociLabels.addProvider(StripedResidues.labelProvider!);
    this.plugin.customModelProperties.register(
      StripedResidues.propertyProvider,
      true
    );
  }

  async load({
    url,
    format = "mmcif",
    isBinary = false,
    assemblyId = ""
  }: LoadParams) {
    await this.plugin.clear();

    const data = await this.plugin.builders.data.download(
      { url: Asset.Url(url), isBinary },
      { state: { isGhost: true } }
    );
    const trajectory = await this.plugin.builders.structure.parseTrajectory(
      data,
      format
    );

    await this.plugin.builders.structure.hierarchy.applyPreset(
      trajectory,
      "default",
      {
        structure: assemblyId
          ? {
              name: "assembly",
              params: { id: assemblyId }
            }
          : {
              name: "model",
              params: {}
            },
        showUnitcell: false,
        representationPreset: "auto"
      }
    );
  }

  setBackground(color: number) {
    PluginCommands.Canvas3D.SetSettings(this.plugin, {
      settings: (props) => {
        props.renderer.backgroundColor = Color(color);
      }
    });
  }

  toggleSpin() {
    if (!this.plugin.canvas3d) return;

    PluginCommands.Canvas3D.SetSettings(this.plugin, {
      settings: (props) => {
        props.trackball.spin = !props.trackball.spin;
      }
    });
    if (!this.plugin.canvas3d.props.trackball.spin)
      PluginCommands.Camera.Reset(this.plugin, {});
  }

  private animateModelIndexTargetFps() {
    return Math.max(1, this.animate.modelIndex.targetFps | 0);
  }

  animate = {
    modelIndex: {
      targetFps: 8,
      onceForward: () => {
        this.plugin.managers.animation.play(AnimateModelIndex, {
          duration: {
            name: "computed",
            params: { targetFps: this.animateModelIndexTargetFps() }
          },
          mode: { name: "once", params: { direction: "forward" } }
        });
      },
      onceBackward: () => {
        this.plugin.managers.animation.play(AnimateModelIndex, {
          duration: {
            name: "computed",
            params: { targetFps: this.animateModelIndexTargetFps() }
          },
          mode: { name: "once", params: { direction: "backward" } }
        });
      },
      palindrome: () => {
        this.plugin.managers.animation.play(AnimateModelIndex, {
          duration: {
            name: "computed",
            params: { targetFps: this.animateModelIndexTargetFps() }
          },
          mode: { name: "palindrome", params: {} }
        });
      },
      loop: () => {
        this.plugin.managers.animation.play(AnimateModelIndex, {
          duration: {
            name: "computed",
            params: { targetFps: this.animateModelIndexTargetFps() }
          },
          mode: { name: "loop", params: { direction: "forward" } }
        });
      },
      stop: () => this.plugin.managers.animation.stop()
    }
  };

  coloring = {
    applyStripes: async () => {
      this.plugin.dataTransaction(async () => {
        for (const s of this.plugin.managers.structure.hierarchy.current
          .structures) {
          await this.plugin.managers.structure.component.updateRepresentationsTheme(
            s.components,
            { color: StripedResidues.propertyProvider.descriptor.name as any }
          );
        }
      });
    },
    applyCustomTheme: async () => {
      this.plugin.dataTransaction(async () => {
        for (const s of this.plugin.managers.structure.hierarchy.current
          .structures) {
          await this.plugin.managers.structure.component.updateRepresentationsTheme(
            s.components,
            { color: CustomColorThemeProvider.name as any }
          );
        }
      });
    },
    applyDefault: async () => {
      this.plugin.dataTransaction(async () => {
        for (const s of this.plugin.managers.structure.hierarchy.current
          .structures) {
          await this.plugin.managers.structure.component.updateRepresentationsTheme(
            s.components,
            { color: "default" }
          );
        }
      });
    }
  };

  interactivity = {
    highlightOn: () => {
      const data = this.plugin.managers.structure.hierarchy.current
        .structures[0]?.cell.obj?.data;
      if (!data) return;

      const seq_id = 7;
      const sel = Script.getStructureSelection(
        (Q) =>
          Q.struct.generator.atomGroups({
            "residue-test": Q.core.rel.eq([
              Q.struct.atomProperty.macromolecular.label_seq_id(),
              seq_id
            ]),
            "group-by": Q.struct.atomProperty.macromolecular.residueKey()
          }),
        data
      );
      const loci = StructureSelection.toLociWithSourceUnits(sel);
      this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
    },
    clearHighlight: () => {
      this.plugin.managers.interactivity.lociHighlights.highlightOnly({
        loci: EmptyLoci
      });
    }
  };

  tests = {
    staticSuperposition: async () => {
      await this.plugin.clear();
      return buildStaticSuperposition(this.plugin, StaticSuperpositionTestData);
    },
    dynamicSuperposition: async () => {
      await this.plugin.clear();
      return dynamicSuperpositionTest(
        this.plugin,
        ["1tqn", "2hhb", "4hhb"],
        "HEM"
      );
    },
    toggleValidationTooltip: () => {
      return this.plugin.state.updateBehavior(
        PDBeStructureQualityReport,
        (params) => {
          params.showTooltip = !params.showTooltip;
        }
      );
    },
    showToasts: () => {
      PluginCommands.Toast.Show(this.plugin, {
        title: "Toast 1",
        message: "This is an example text, timeout 3s",
        key: "toast-1",
        timeoutMs: 3000
      });
      PluginCommands.Toast.Show(this.plugin, {
        title: "Toast 2",
        message: CustomToastMessage,
        key: "toast-2"
      });
    },
    hideToasts: () => {
      PluginCommands.Toast.Hide(this.plugin, { key: "toast-1" });
      PluginCommands.Toast.Hide(this.plugin, { key: "toast-2" });
    }
  };
}

(window as any).BasicMolStarWrapper = new BasicWrapper();

function $(id) {
  return document.getElementById(id);
}

var pdbId = "1lol",
  assemblyId = "1";
  var url = "https://files.rcsb.org/download/" + pdbId + ".pdb";
var format = "PDB";

$("url").value = url;
$("url").onchange = function (e) {
  url = e.target.value;
};


$("assemblyId").value = assemblyId;
$("assemblyId").onchange = function (e) {
  assemblyId = e.target.value;
};
$("format").value = format;
$("format").onchange = function (e) {
  format = e.target.value;
};

BasicMolStarWrapper.init("app" /** or document.getElementById('app') */);
BasicMolStarWrapper.setBackground(0xffffff);

addControl("Load Asym Unit", () =>
  BasicMolStarWrapper.load({ url: url, format: format })
);
addControl("Load Assembly", () =>
  BasicMolStarWrapper.load({
    url: url,
    format: format,
    assemblyId: assemblyId
  })
);

addSeparator();

addHeader("Camera");
addControl("Toggle Spin", () => BasicMolStarWrapper.toggleSpin());

addSeparator();

addHeader("Animation");

// adjust this number to make the animation faster or slower
// requires to "restart" the animation if changed
BasicMolStarWrapper.animate.modelIndex.targetFps = 30;

addControl("Play To End", () =>
  BasicMolStarWrapper.animate.modelIndex.onceForward()
);
addControl("Play To Start", () =>
  BasicMolStarWrapper.animate.modelIndex.onceBackward()
);
addControl("Play Palindrome", () =>
  BasicMolStarWrapper.animate.modelIndex.palindrome()
);
addControl("Play Loop", () => BasicMolStarWrapper.animate.modelIndex.loop());
addControl("Stop", () => BasicMolStarWrapper.animate.modelIndex.stop());

addHeader("Misc");

addControl("Apply Stripes", () => BasicMolStarWrapper.coloring.applyStripes());
addControl("Apply Custom Theme", () =>
  BasicMolStarWrapper.coloring.applyCustomTheme()
);
addControl("Default Coloring", () =>
  BasicMolStarWrapper.coloring.applyDefault()
);

addHeader("Interactivity");
addControl("Highlight seq_id=7", () =>
  BasicMolStarWrapper.interactivity.highlightOn()
);
addControl("Clear Highlight", () =>
  BasicMolStarWrapper.interactivity.clearHighlight()
);

addHeader("Tests");

addControl("Static Superposition", () =>
  BasicMolStarWrapper.tests.staticSuperposition()
);
addControl("Dynamic Superposition", () =>
  BasicMolStarWrapper.tests.dynamicSuperposition()
);
addControl("Validation Tooltip", () =>
  BasicMolStarWrapper.tests.toggleValidationTooltip()
);

addControl("Show Toasts", () => BasicMolStarWrapper.tests.showToasts());
addControl("Hide Toasts", () => BasicMolStarWrapper.tests.hideToasts());

////////////////////////////////////////////////////////

function addControl(label, action) {
  var btn = document.createElement("button");
  btn.onclick = action;
  btn.innerText = label;
  $("controls").appendChild(btn);
}

function addSeparator() {
  var hr = document.createElement("hr");
  $("controls").appendChild(hr);
}

function addHeader(header) {
  var h = document.createElement("h3");
  h.innerText = header;
  $("controls").appendChild(h);
}
