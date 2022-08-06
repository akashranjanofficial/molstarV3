import { isPositionLocation } from "molstar/lib/mol-geo/util/location-iterator";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import { ColorTheme } from "molstar/lib/mol-theme/color";
import { ThemeDataContext } from "molstar/lib/mol-theme/theme";
import { Color } from "molstar/lib/mol-util/color";
import { ColorNames } from "molstar/lib/mol-util/color/names";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";

export function CustomColorTheme(
  ctx: ThemeDataContext,
  props: PD.Values<{}>
): ColorTheme<{}> {
  const { radius, center } = ctx.structure?.boundary.sphere!;
  const radiusSq = Math.max(radius * radius, 0.001);
  const scale = ColorTheme.PaletteScale;

  return {
    factory: CustomColorTheme,
    granularity: "vertex",
    color: (location) => {
      if (!isPositionLocation(location)) return ColorNames.black;
      const dist = Vec3.squaredDistance(location.position, center);
      const t = Math.min(dist / radiusSq, 1);
      return ((t * scale) | 0) as Color;
    },
    palette: {
      filter: "nearest",
      colors: [
        ColorNames.red,
        ColorNames.pink,
        ColorNames.violet,
        ColorNames.orange,
        ColorNames.yellow,
        ColorNames.green,
        ColorNames.blue
      ]
    },
    props: props,
    description: ""
  };
}

export const CustomColorThemeProvider: ColorTheme.Provider<
  {},
  "basic-wrapper-custom-color-theme"
> = {
  name: "basic-wrapper-custom-color-theme",
  label: "Custom Color Theme",
  category: "Miscellaneous",
  factory: CustomColorTheme,
  getParams: () => ({}),
  defaultValues: {},
  isApplicable: (ctx: ThemeDataContext) => true
};
