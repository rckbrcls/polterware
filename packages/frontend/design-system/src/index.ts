/* Shared materials (edge-light tokens + utilities) — load with package entry */
import "./materials.css";
import { installSpringCssProperties } from "./spring-css";

/* Spring tiers as CSS custom properties (--spring-<tier>-*), sampled from springs.ts. */
if (typeof document !== "undefined") installSpringCssProperties();

export { PolterMascot } from "./mascot";
export { Button, LinkButton, buttonClassName } from "./button";
export type { ButtonProps, ButtonVariant, ButtonSize, ButtonTone, LinkButtonProps } from "./button";
export { Badge } from "./badge";
export { CountBadge } from "./count-badge";
export type { CountBadgeProps, CountBadgeTone } from "./count-badge";
export { FloatingCountBadge } from "./floating-count-badge";
export type {
  FloatingCountBadgeProps,
  FloatingCountBadgeTone,
} from "./floating-count-badge";
export { Card, Surface } from "./card";
export { Separator } from "./separator";
export { StatusDot, StatusChip } from "./status";
export type { StatusChipAppearance, StatusTone } from "./status";
export { FilterMark } from "./filter-mark";
export type { FilterMarkProps, FilterMarkShape } from "./filter-mark";
export {
  IconTile,
  AuroraCover,
  auroraForId,
  AURORA_ACCENTS,
  AURORA_PALETTES,
  resolveAuroraAccent,
  ICON_TILE_BRAND_ACCENTS,
  resolveIconTileAccent,
} from "./icon-tile";
export type {
  IconTileSize,
  IconTileFinish,
  IconTileProps,
  IconTileTone,
  AuroraPalette,
  AuroraCoverProps,
} from "./icon-tile";
export { TemplateCard, TemplateCardGrid } from "./template-card";
export type {
  TemplateCardGridItem,
  TemplateCardGridProps,
  TemplateCardProps,
} from "./template-card";
export { PromptCardGrid, copyAgentPrompt } from "./prompt-card";
export type { PromptCardGridItem, PromptCardGridProps } from "./prompt-card";
export { EmptyBot, type EmptyBotMood } from "./empty-bot";
export { PageLoading, PageEmpty, PageError, FixtureBanner, PageOffline, PageForbidden } from "./feedback";
export { Skeleton, PageSkeleton } from "./skeleton";
export type { SkeletonProps, PageSkeletonProps, PageSkeletonLayout } from "./skeleton";
export { ToastRegion, pushToast } from "./toast";
export type { ToastAction, ToastItem, ToastOptions } from "./toast";
export { ConfirmRegion, requestConfirm } from "./confirm";
export type { ConfirmOptions } from "./confirm";
export { ArchivedList } from "./archived-list";
export type { ArchivedListItem } from "./archived-list";
export { PageHeader, PageContent, PageToolbar } from "./page";
export type { PageToolbarRootProps, PageToolbarSlotProps } from "./page";
export { TextureButtonGroup } from "./texture-button-group";
export type { TextureButtonGroupItem } from "./texture-button-group";
export { ToolbarIconButton } from "./toolbar-icon-button";
export type { ToolbarIconButtonProps } from "./toolbar-icon-button";
export { SearchBar } from "./search-bar";
export type { SearchBarProps } from "./search-bar";
export { Tabs, TabPanel } from "./tabs";
export type { TabItem, TabTooltip } from "./tabs";
export { Drawer } from "./drawer";
export { Popover } from "./popover";
export { TagPicker } from "./tag-picker";
export type { TagPickerOption, TagPickerProps } from "./tag-picker";
export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuPreviewPanel,
  navigationMenuTriggerClass,
} from "./navigation-menu";
export type {
  NavigationMenuProps,
  NavigationMenuLinkProps,
  NavigationMenuPreviewItem,
} from "./navigation-menu";
export { Tooltip } from "./tooltip";
export type {
  TooltipContentProps,
  TooltipGroupProps,
  TooltipPlacement,
  TooltipRootProps,
  TooltipTriggerProps,
} from "./tooltip";
export { Kbd } from "./kbd";
export type { KbdProps } from "./kbd";
export { spring } from "./springs";
export { springCssProperties, springLinearEasing } from "./spring-css";
export { prefersReducedMotion } from "./reduced-motion";
export { animateCollapse } from "./collapse";
export { createDragMotion } from "./drag-motion";
export type { DragMotion } from "./drag-motion";
export { createPanMotion } from "./pan-motion";
export type { PanMotion } from "./pan-motion";
export { createPlacementMotion } from "./placement-motion";
export type { Placement, PlacementMotion } from "./placement-motion";
export { IconSwap } from "./icon-swap";
export type { IconSwapProps } from "./icon-swap";
export type { CollapseControls } from "./collapse";
export {
  centerItemInView,
  createFluidHover,
  FluidHoverHighlight,
  FLUID_HOVER_ACTIVE_ATTR,
  pickNearest,
} from "./fluid-hover";
export type {
  FluidHover,
  FluidHoverAxis,
  FluidHoverHighlightProps,
  FluidHoverOptions,
  ItemRect,
} from "./fluid-hover";
export { Switch, SwitchRow } from "./switch";
export type { SwitchProps, SwitchRowProps, SwitchSize } from "./switch";
export { FilterPopover } from "./filter-popover";
export type { FilterPopoverProps } from "./filter-popover";
export { createSavedFilters } from "./saved-filters";
export type { CreateSavedFiltersOptions, SavedFilterRecord, SavedFiltersApi } from "./saved-filters";
export { FilterOptionsPanel } from "./filter-options-panel";
export type { FilterOptionsPanelProps } from "./filter-options-panel";
export {
  FILTER_IS,
  FILTER_IS_NOT,
  addClause,
  clausesFor,
  createClauseId,
  filterOperators,
  matchClauses,
  operatorLabel,
  parseFilterPayload,
  pluralize,
  removeClause,
  sameClauses,
  serializeFilterPayload,
  setClauseOperator,
  setClauseValues,
  toggleClauseValue,
  valueSummary,
} from "./filter-model";
export type {
  FilterAccessors,
  FilterClause,
  FilterField,
  FilterFieldKind,
  FilterFieldOption,
  FilterFieldValue,
  FilterIcon,
  FilterMatcher,
  FilterOperatorDef,
  FilterPayload,
  SavedFilter,
  SavedFiltersController,
} from "./filter-model";
export { DataTable, DataTableSelectionToolbarHost } from "./table";
export type {
  DataTableColumnHeaderProps,
  DataTablePrimaryCellProps,
  DataTableRootProps,
  DataTableSelectionMode,
  DataTableSelectionState,
  DataTableSelectionToolbarProps,
  DataTableSelectionToolbarState,
  DataTableSortDirection,
  DataTableSortState,
  DataTableSortValue,
} from "./table";
export {
  DETAIL_PANEL_DEFAULT_WIDTH,
  DETAIL_PANEL_MAX_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  DETAIL_PANEL_SIDEBAR_ID,
  DetailPanel,
  SidePanel,
  DetailPanelCollectionHeader,
  CollapsibleSection,
  clampDetailPanelWidth,
  readDetailPanelWidth,
} from "./detail-panel";
export type {
  DetailPanelBodyProps,
  DetailPanelHeaderProps,
  DetailPanelFooterProps,
  DetailPanelMainProps,
  DetailPanelRailProps,
  DetailPanelTitleProps,
  DetailPanelRootProps,
  DetailPanelSectionProps,
} from "./detail-panel";
export type {
  DetailPanelPropertiesProps,
  DetailPanelPropertyProps,
} from "./detail-panel-properties";
export type {
  DetailPanelLinkCandidate,
  DetailPanelLinkedEntitiesProps,
  DetailPanelLinkedEntity,
} from "./detail-panel-linked-entities";
export type {
  DetailPanelMenuItemProps,
  DetailPanelMenuProps,
} from "./detail-panel-menu";
export type { DetailPanelPrimaryActionProps } from "./detail-panel-primary-action";
export { MarkdownEditor } from "./markdown-editor";
export type { MarkdownEditorProps } from "./markdown-editor";
export { ResizableSidebar, ResizableSplit } from "../panels/resizable";
export type { ResizableSidebarProps } from "../panels/resizable";
export { A11yDialog, Dialog } from "./dialog";
export type { A11yDialogProps, DialogSize } from "./dialog";
export { SettingsDialog, SettingsRow, SettingsSection, searchSettings, settingsSectionId } from "./settings-dialog";
export type { SettingsDialogProps, SettingsNavItem, SettingsSearchEntry } from "./settings-dialog";
export { Input, Textarea } from "./input";
export type { InputProps, TextareaProps, ControlFieldSize } from "./input";
export { Select } from "./select";
export type { SelectProps, SelectOption } from "./select";
export { Field } from "./field";
export { FormStack } from "./form-stack";
export { IconNameField, type IconNameFieldProps } from "./icon-name-field";
export { MenuPanel, MenuList, MenuItem } from "./menu";
export { SelectionCheck, SELECTION_ACK_MS } from "./menu-highlight";
export type { MenuItemProps } from "./menu";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu";
export type { DropdownMenuProps } from "./dropdown-menu";
export { ContextMenu } from "./context-menu";
export type { ContextMenuRootProps } from "./context-menu";
export { FilterChip, FilterChipGroup } from "./filter-chip";
export type { FilterChipItem } from "./filter-chip";
export { ToggleChip } from "./toggle-chip";
export type { ToggleChipProps, ToggleChipTone } from "./toggle-chip";
export { DisclosureButton } from "./disclosure-button";
export type { DisclosureButtonProps } from "./disclosure-button";
export { SwitcherTrigger } from "./switcher-trigger";
export type { SwitcherTriggerProps } from "./switcher-trigger";
export { ActiveFilterBar } from "./active-filter-bar";
export type { ActiveFilterBarProps, ActiveFilterPill } from "./active-filter-bar";
export * from "./hugeicons";

export { FloatingSurfaceProvider, TextureFaceProvider, useInFloatingSurface, useTextureFace } from "./floating-surface";
export { FloatingWindow } from "./floating-window";
export type { FloatingWindowRootProps, FloatingWindowHeaderProps } from "./floating-window";
export type { FloatingWindowDock, FloatingWindowGeometry } from "./floating-window-geometry";

export { DesignSystemProvider, useDesignSystem, type DesignSystemProviderProps, type DesignSystemShortcut } from "./provider";
export { registerIconTileAccents } from "./icon-tile";
export { CHROME_PRESETS, CHROME_VARIANTS, chromeStopsFromTint, chromeVariant, chromeVariantIndex, type ChromePreset, type ChromeStop } from "./chrome-finish";
export { EmptyIllustration } from "./feedback";
export { Checkbox, CheckboxRow, type CheckboxProps, type CheckboxRowProps } from "./checkbox";
export { SegmentedControl, type SegmentedControlProps, type SegmentOption } from "./segmented-control";
export { NumberStepper, type NumberStepperProps } from "./number-stepper";
export { Slider, type SliderProps } from "./slider";
export { Calendar, type CalendarProps } from "./calendar";
export { DateTimePicker, type DateTimePickerProps } from "./date-time-picker";
export { DatePicker, parseDate, type DatePickerProps, type DateValue } from "./date-picker";
export { TimePicker, parseTime, type TimePickerProps } from "./time-picker";
export { ColorSwatchPicker, parseColor, type ColorSwatchPickerProps, type ColorSwatchOption } from "./color-swatch-picker";
export { IconPicker, PICKER_ICONS, type IconPickerProps, type PickerIconName } from "./icon-picker";
export { TreeView, type TreeViewProps, type TreeViewNode } from "./tree-view";
export { SegmentDisplay, type SegmentDisplayProps } from "./segment-display";
export { ProgressRing, type ProgressRingProps } from "./progress-ring";
export { ProgressBar, type ProgressBarProps } from "./progress-bar";
export { Heatmap, heatmapLevel, type HeatmapProps, type HeatmapDay } from "./heatmap";
export { CalendarGrid, type CalendarGridProps } from "./calendar-grid";
export { SparkChart, type SparkChartProps } from "./spark-chart";

/* Load after component chrome so keyboard focus remains visible. */
import "./accessibility.css";
