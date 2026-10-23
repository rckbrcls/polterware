import { IconTile, PICKER_ICONS, type PickerIconName } from "@polterware/frontend-design-system";

/** The Space's own mark (icon and color), sized for menu rows. */
export function spaceMark(color: string | undefined, icon: string | undefined, seed?: string) {
  const Icon = PICKER_ICONS[(icon && icon in PICKER_ICONS ? icon : "brain") as PickerIconName];
  return <IconTile size={16} tone="knowledge" accent={color || undefined} seed={seed}><Icon size={10} /></IconTile>;
}
