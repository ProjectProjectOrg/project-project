import {
  AccessibilityIcon,
  Alert02Icon,
  AlertCircleIcon,
  ArchiveArrowUpIcon,
  ArchiveIcon,
  ArrowDataTransferHorizontalIcon,
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowExpand01Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowRightToLineIcon,
  ArrowShrink02Icon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  ArrowUpBigIcon,
  ArrowUpRight01Icon,
  Attachment01Icon,
  Book02Icon,
  BookOpen01Icon,
  Bookmark02Icon,
  Briefcase01Icon,
  Bug01Icon,
  Building03Icon,
  Calendar01Icon,
  Calendar02Icon,
  Calendar03Icon,
  CalendarClockIcon,
  CalendarRemove01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ChampionIcon,
  CheckListIcon,
  CheckmarkCircle01Icon,
  CheckmarkCircle02Icon,
  CheckmarkSquare02Icon,
  CircleDotDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CircleSlashIcon,
  ClipboardListIcon,
  Clock01Icon,
  CloudOffIcon,
  CodeIcon,
  CodeXmlIcon,
  CommandIcon,
  CompassIcon,
  ComputerIcon,
  ComputerPhoneSyncIcon,
  ComputerTerminal01Icon,
  Copy01Icon,
  CornerDownLeftIcon,
  CrownIcon,
  DashboardSquare02Icon,
  DashedLineCircleIcon,
  Database01Icon,
  Delete02Icon,
  DiamondIcon,
  DicesIcon,
  Download01Icon,
  DragDropVerticalIcon,
  EqualSignSquareIcon,
  FavouriteIcon,
  FileAddIcon,
  FileBlockIcon,
  FileImportIcon,
  FileTextIcon,
  FilmIcon,
  FilterHorizontalIcon,
  FilterIcon,
  FilterRemoveIcon,
  FireIcon,
  Flag02Icon,
  FlagOffIcon,
  FlashIcon,
  FoldHorizontalIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderImportIcon,
  FolderKanbanIcon,
  FolderOpenIcon,
  FootprintsIcon,
  FullScreenIcon,
  GaugeIcon,
  GitBranchIcon,
  GitBranchMinusIcon,
  GitBranchPlusIcon,
  GitCompareIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestCreateArrowIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  Globe02Icon,
  Hammer01Icon,
  HardDriveIcon,
  HashtagIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  Heading04Icon,
  Heading05Icon,
  Heading06Icon,
  HelpCircleIcon,
  HexagonIcon,
  HourglassIcon,
  Idea01Icon,
  Image01Icon,
  InboxIcon,
  InformationCircleIcon,
  InputTextIcon,
  JusticeScale01Icon,
  Key01Icon,
  LaptopIcon,
  Layers01Icon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  LayoutThreeColumnIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  LibraryIcon,
  Link01Icon,
  Link02Icon,
  LinkSquare02Icon,
  ListFilterIcon,
  ListPlusIcon,
  ListTreeIcon,
  LoaderCircleIcon,
  Loading03Icon,
  Logout03Icon,
  Mail01Icon,
  MailValidation01Icon,
  Medal01Icon,
  Megaphone01Icon,
  Menu01Icon,
  Message01Icon,
  Message02Icon,
  MessageAdd01Icon,
  MicroscopeIcon,
  MinimizeScreenIcon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  Notification03Icon,
  NotificationOff03Icon,
  OctagonMinusIcon,
  OptionIcon,
  PackageIcon,
  PaintBoardIcon,
  ParagraphIcon,
  PauseIcon,
  PenTool01Icon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  Plug01Icon,
  PlusSignIcon,
  PulseIcon,
  PuzzleIcon,
  QuoteDownIcon,
  RedoIcon,
  Refresh03Icon,
  RoboticIcon,
  Rocket01Icon,
  Rows3Icon,
  ScanIcon,
  Search01Icon,
  SecurityCheckIcon,
  ServerStack01Icon,
  Settings01Icon,
  Shapes01Icon,
  Share08Icon,
  Shield01Icon,
  SirenIcon,
  SkullIcon,
  SlidersHorizontalIcon,
  SortByDown02Icon,
  SortByUp02Icon,
  SourceCodeIcon,
  SourceCodeSquareIcon,
  SparklesIcon,
  SplitIcon,
  SquareIcon,
  SquareLock02Icon,
  StampIcon,
  Sun03Icon,
  TShirtIcon,
  TableIcon,
  Tag01Icon,
  Target02Icon,
  TaskDaily01Icon,
  TelescopeIcon,
  TestTube01Icon,
  TextBoldIcon,
  TextFontIcon,
  TextIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  Tick02Icon,
  Timer02Icon,
  TriangleIcon,
  UnavailableIcon,
  Undo02Icon,
  UndoIcon,
  UnfoldLessIcon,
  UnfoldMoreIcon,
  UngroupIcon,
  Unlink04Icon,
  UnplugIcon,
  Upload01Icon,
  UserAdd01Icon,
  UserCheck01Icon,
  UserIcon,
  UserMinus01Icon,
  UserMultipleIcon,
  ViewIcon,
  ViewOffSlashIcon,
  VolumeHighIcon,
  VolumeMute02Icon,
  WorkflowIcon,
  Wrench01Icon
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

export type { IconSvgElement }
import type * as React from "react"

/*
 * The app's icons: Hugeicons (free set, stroke rounded) behind one module,
 * imported as `@pp/ui/icons`. Each export keeps the name the code used under
 * Lucide, so call sites only change their import path; a later swap of a
 * glyph, or of the whole set, happens here.
 *
 * Every icon renders at 24px with a 1.5 stroke (Hugeicons' native weight)
 * unless the call site says otherwise. The svg carries `data-icon`, so
 * theme.css can let its shapes inherit a stroke width set on the svg (CSS
 * like a highlighted row's `stroke-[2]`); Hugeicons writes stroke-width on
 * every shape.
 */

export type IconProps = Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
  size?: number | string
  strokeWidth?: number
  absoluteStrokeWidth?: boolean
  ref?: React.Ref<SVGSVGElement>
}

export type IconType = React.ComponentType<IconProps>

export function icon(svg: IconSvgElement, name: string): IconType {
  function AppIcon(props: IconProps) {
    return (
      <HugeiconsIcon
        icon={svg}
        size={24}
        strokeWidth={1.5}
        data-icon=""
        {...props}
      />
    )
  }
  AppIcon.displayName = name
  return AppIcon
}

// Glyphs the free set lacks, drawn in its style: round caps and joins, 1.5.
const BackspaceGlyph: IconSvgElement = [
  [
    "path",
    {
      d: "M9.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9.5a2 2 0 0 1-1.48-.66l-4.55-5a2 2 0 0 1 0-2.68l4.55-5A2 2 0 0 1 9.5 5Z",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "0"
    }
  ],
  [
    "path",
    {
      d: "M17 9.5l-5 5",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "1"
    }
  ],
  [
    "path",
    {
      d: "M12 9.5l5 5",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "2"
    }
  ]
]

const SignalGlyph: IconSvgElement = [
  [
    "path",
    {
      d: "M2 20h.01",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "0"
    }
  ],
  [
    "path",
    {
      d: "M7 20v-4",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "1"
    }
  ],
  [
    "path",
    {
      d: "M12 20v-8",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "2"
    }
  ],
  [
    "path",
    {
      d: "M17 20V8",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "3"
    }
  ],
  [
    "path",
    {
      d: "M22 20V4",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "4"
    }
  ]
]

const SignalHighGlyph: IconSvgElement = [
  [
    "path",
    {
      d: "M2 20h.01",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "0"
    }
  ],
  [
    "path",
    {
      d: "M7 20v-4",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "1"
    }
  ],
  [
    "path",
    {
      d: "M12 20v-8",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "2"
    }
  ],
  [
    "path",
    {
      d: "M17 20V8",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "3"
    }
  ]
]

const SignalMediumGlyph: IconSvgElement = [
  [
    "path",
    {
      d: "M2 20h.01",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "0"
    }
  ],
  [
    "path",
    {
      d: "M7 20v-4",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "1"
    }
  ],
  [
    "path",
    {
      d: "M12 20v-8",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "2"
    }
  ]
]

const SignalLowGlyph: IconSvgElement = [
  [
    "path",
    {
      d: "M2 20h.01",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "0"
    }
  ],
  [
    "path",
    {
      d: "M7 20v-4",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "1"
    }
  ]
]

export const Accessibility = icon(AccessibilityIcon, "Accessibility")
export const Activity = icon(PulseIcon, "Activity")
export const AlertCircle = icon(AlertCircleIcon, "AlertCircle")
export const AlertTriangle = icon(Alert02Icon, "AlertTriangle")
export const Archive = icon(ArchiveIcon, "Archive")
export const ArchiveRestore = icon(ArchiveArrowUpIcon, "ArchiveRestore")
export const ArrowBigUp = icon(ArrowUpBigIcon, "ArrowBigUp")
export const ArrowDown = icon(ArrowDown02Icon, "ArrowDown")
export const ArrowDownWideNarrow = icon(SortByDown02Icon, "ArrowDownWideNarrow")
export const ArrowLeft = icon(ArrowLeft02Icon, "ArrowLeft")
export const ArrowLeftRight = icon(
  ArrowDataTransferHorizontalIcon,
  "ArrowLeftRight"
)
export const ArrowRight = icon(ArrowRight02Icon, "ArrowRight")
export const ArrowRightLeft = icon(
  ArrowDataTransferHorizontalIcon,
  "ArrowRightLeft"
)
export const ArrowRightToLine = icon(ArrowRightToLineIcon, "ArrowRightToLine")
export const ArrowUp = icon(ArrowUp02Icon, "ArrowUp")
export const ArrowUpNarrowWide = icon(SortByUp02Icon, "ArrowUpNarrowWide")
export const ArrowUpRight = icon(ArrowUpRight01Icon, "ArrowUpRight")
export const Award = icon(Medal01Icon, "Award")
export const Ban = icon(UnavailableIcon, "Ban")
export const Bell = icon(Notification03Icon, "Bell")
export const BellOff = icon(NotificationOff03Icon, "BellOff")
export const Bold = icon(TextBoldIcon, "Bold")
export const Bookmark = icon(Bookmark02Icon, "Bookmark")
export const BookOpen = icon(BookOpen01Icon, "BookOpen")
export const BookText = icon(Book02Icon, "BookText")
export const Bot = icon(RoboticIcon, "Bot")
export const Briefcase = icon(Briefcase01Icon, "Briefcase")
export const Bug = icon(Bug01Icon, "Bug")
export const Building2 = icon(Building03Icon, "Building2")
export const Calendar = icon(Calendar03Icon, "Calendar")
export const CalendarClock = icon(CalendarClockIcon, "CalendarClock")
export const CalendarDays = icon(Calendar01Icon, "CalendarDays")
export const CalendarRange = icon(Calendar02Icon, "CalendarRange")
export const CalendarX = icon(CalendarRemove01Icon, "CalendarX")
export const Check = icon(Tick02Icon, "Check")
export const ChevronDown = icon(ArrowDown01Icon, "ChevronDown")
export const ChevronLeft = icon(ArrowLeft01Icon, "ChevronLeft")
export const ChevronRight = icon(ArrowRight01Icon, "ChevronRight")
export const ChevronRightIcon = icon(ArrowRight01Icon, "ChevronRightIcon")
export const ChevronsDownUp = icon(UnfoldLessIcon, "ChevronsDownUp")
export const ChevronsUpDown = icon(UnfoldMoreIcon, "ChevronsUpDown")
export const ChevronUp = icon(ArrowUp01Icon, "ChevronUp")
export const Circle = icon(CircleIcon, "Circle")
export const CircleAlert = icon(AlertCircleIcon, "CircleAlert")
export const CircleCheck = icon(CheckmarkCircle02Icon, "CircleCheck")
export const CircleCheckBig = icon(CheckmarkCircle01Icon, "CircleCheckBig")
export const CircleDashed = icon(DashedLineCircleIcon, "CircleDashed")
export const CircleDot = icon(CircleDotIcon, "CircleDot")
export const CircleDotDashed = icon(CircleDotDashedIcon, "CircleDotDashed")
export const CircleHelp = icon(HelpCircleIcon, "CircleHelp")
export const CircleQuestionMark = icon(HelpCircleIcon, "CircleQuestionMark")
export const CircleSlash = icon(CircleSlashIcon, "CircleSlash")
export const ClipboardList = icon(ClipboardListIcon, "ClipboardList")
export const Clock = icon(Clock01Icon, "Clock")
export const Clock3 = icon(Clock01Icon, "Clock3")
export const CloudOff = icon(CloudOffIcon, "CloudOff")
export const Code = icon(SourceCodeIcon, "Code")
export const Code2 = icon(CodeIcon, "Code2")
export const CodeXml = icon(CodeXmlIcon, "CodeXml")
export const Columns3 = icon(LayoutThreeColumnIcon, "Columns3")
export const Command = icon(CommandIcon, "Command")
export const Compass = icon(CompassIcon, "Compass")
export const Copy = icon(Copy01Icon, "Copy")
export const CornerDownLeft = icon(CornerDownLeftIcon, "CornerDownLeft")
export const Crown = icon(CrownIcon, "Crown")
export const Database = icon(Database01Icon, "Database")
export const Delete = icon(BackspaceGlyph, "Delete")
export const Diamond = icon(DiamondIcon, "Diamond")
export const Dices = icon(DicesIcon, "Dices")
export const Download = icon(Download01Icon, "Download")
export const ExternalLink = icon(LinkSquare02Icon, "ExternalLink")
export const Eye = icon(ViewIcon, "Eye")
export const EyeOff = icon(ViewOffSlashIcon, "EyeOff")
export const FileOff = icon(FileBlockIcon, "FileOff")
export const FilePlus2 = icon(FileAddIcon, "FilePlus2")
export const FileText = icon(FileTextIcon, "FileText")
export const Film = icon(FilmIcon, "Film")
export const Filter = icon(FilterIcon, "Filter")
export const FilterX = icon(FilterRemoveIcon, "FilterX")
export const Flag = icon(Flag02Icon, "Flag")
export const FlagOff = icon(FlagOffIcon, "FlagOff")
export const Flame = icon(FireIcon, "Flame")
export const FlaskConical = icon(TestTube01Icon, "FlaskConical")
export const Folder = icon(Folder01Icon, "Folder")
export const FolderIcon = icon(Folder01Icon, "FolderIcon")
export const FolderInput = icon(FolderImportIcon, "FolderInput")
export const FolderKanban = icon(FolderKanbanIcon, "FolderKanban")
export const FolderOpen = icon(FolderOpenIcon, "FolderOpen")
export const FolderPlus = icon(FolderAddIcon, "FolderPlus")
export const FoldHorizontal = icon(FoldHorizontalIcon, "FoldHorizontal")
export const Footprints = icon(FootprintsIcon, "Footprints")
export const Gauge = icon(GaugeIcon, "Gauge")
export const GitBranch = icon(GitBranchIcon, "GitBranch")
export const GitBranchMinus = icon(GitBranchMinusIcon, "GitBranchMinus")
export const GitBranchPlus = icon(GitBranchPlusIcon, "GitBranchPlus")
export const GitCompareArrows = icon(GitCompareIcon, "GitCompareArrows")
export const GitMerge = icon(GitMergeIcon, "GitMerge")
export const GitPullRequest = icon(GitPullRequestIcon, "GitPullRequest")
export const GitPullRequestClosed = icon(
  GitPullRequestClosedIcon,
  "GitPullRequestClosed"
)
export const GitPullRequestCreateArrow = icon(
  GitPullRequestCreateArrowIcon,
  "GitPullRequestCreateArrow"
)
export const GitPullRequestDraft = icon(
  GitPullRequestDraftIcon,
  "GitPullRequestDraft"
)
export const Globe = icon(Globe02Icon, "Globe")
export const GripVertical = icon(DragDropVerticalIcon, "GripVertical")
export const Hammer = icon(Hammer01Icon, "Hammer")
export const HardDrive = icon(HardDriveIcon, "HardDrive")
export const Hash = icon(HashtagIcon, "Hash")
export const Heading1 = icon(Heading01Icon, "Heading1")
export const Heading2 = icon(Heading02Icon, "Heading2")
export const Heading3 = icon(Heading03Icon, "Heading3")
export const Heading4 = icon(Heading04Icon, "Heading4")
export const Heading5 = icon(Heading05Icon, "Heading5")
export const Heading6 = icon(Heading06Icon, "Heading6")
export const Heart = icon(FavouriteIcon, "Heart")
export const Hexagon = icon(HexagonIcon, "Hexagon")
export const Hourglass = icon(HourglassIcon, "Hourglass")
export const Image = icon(Image01Icon, "Image")
export const Import = icon(FileImportIcon, "Import")
export const Inbox = icon(InboxIcon, "Inbox")
export const Info = icon(InformationCircleIcon, "Info")
export const Italic = icon(TextItalicIcon, "Italic")
export const KeyRound = icon(Key01Icon, "KeyRound")
export const Laptop = icon(LaptopIcon, "Laptop")
export const Layers = icon(Layers01Icon, "Layers")
export const LayoutDashboard = icon(DashboardSquare02Icon, "LayoutDashboard")
export const LayoutGrid = icon(LayoutGridIcon, "LayoutGrid")
export const LayoutTemplate = icon(LayoutTemplateIcon, "LayoutTemplate")
export const LibraryBig = icon(LibraryIcon, "LibraryBig")
export const Lightbulb = icon(Idea01Icon, "Lightbulb")
export const Link = icon(Link01Icon, "Link")
export const Link2 = icon(Link02Icon, "Link2")
export const List = icon(LeftToRightListBulletIcon, "List")
export const ListChecks = icon(CheckListIcon, "ListChecks")
export const ListFilter = icon(ListFilterIcon, "ListFilter")
export const ListOrdered = icon(LeftToRightListNumberIcon, "ListOrdered")
export const ListPlus = icon(ListPlusIcon, "ListPlus")
export const ListTodo = icon(TaskDaily01Icon, "ListTodo")
export const ListTree = icon(ListTreeIcon, "ListTree")
export const Loader = icon(Loading03Icon, "Loader")
export const Loader2 = icon(LoaderCircleIcon, "Loader2")
export const LoaderCircle = icon(LoaderCircleIcon, "LoaderCircle")
export const LoaderIcon = icon(Loading03Icon, "LoaderIcon")
export const Lock = icon(SquareLock02Icon, "Lock")
export const LogOut = icon(Logout03Icon, "LogOut")
export const Mail = icon(Mail01Icon, "Mail")
export const MailCheck = icon(MailValidation01Icon, "MailCheck")
export const Maximize = icon(FullScreenIcon, "Maximize")
export const Maximize2 = icon(ArrowExpand01Icon, "Maximize2")
export const Megaphone = icon(Megaphone01Icon, "Megaphone")
export const Menu = icon(Menu01Icon, "Menu")
export const MessageSquare = icon(Message01Icon, "MessageSquare")
export const MessageSquarePlus = icon(MessageAdd01Icon, "MessageSquarePlus")
export const MessagesSquare = icon(Message02Icon, "MessagesSquare")
export const Microscope = icon(MicroscopeIcon, "Microscope")
export const Minimize = icon(MinimizeScreenIcon, "Minimize")
export const Minimize2 = icon(ArrowShrink02Icon, "Minimize2")
export const Minus = icon(MinusSignIcon, "Minus")
export const Monitor = icon(ComputerIcon, "Monitor")
export const MonitorSmartphone = icon(
  ComputerPhoneSyncIcon,
  "MonitorSmartphone"
)
export const Moon = icon(Moon02Icon, "Moon")
export const MoreHorizontal = icon(MoreHorizontalIcon, "MoreHorizontal")
export const NotebookPen = icon(NotebookPenIcon, "NotebookPen")
export const OctagonMinus = icon(OctagonMinusIcon, "OctagonMinus")
export const Option = icon(OptionIcon, "Option")
export const Package = icon(PackageIcon, "Package")
export const Palette = icon(PaintBoardIcon, "Palette")
export const Paperclip = icon(Attachment01Icon, "Paperclip")
export const Pause = icon(PauseIcon, "Pause")
export const Pencil = icon(PencilEdit01Icon, "Pencil")
export const PenTool = icon(PenTool01Icon, "PenTool")
export const Pilcrow = icon(ParagraphIcon, "Pilcrow")
export const Pin = icon(PinIcon, "Pin")
export const PinOff = icon(PinOffIcon, "PinOff")
export const Play = icon(PlayIcon, "Play")
export const Plug = icon(Plug01Icon, "Plug")
export const Plus = icon(PlusSignIcon, "Plus")
export const Puzzle = icon(PuzzleIcon, "Puzzle")
export const RefreshCw = icon(Refresh03Icon, "RefreshCw")
export const Rocket = icon(Rocket01Icon, "Rocket")
export const RotateCcw = icon(UndoIcon, "RotateCcw")
export const RotateCw = icon(RedoIcon, "RotateCw")
export const Rows3 = icon(Rows3Icon, "Rows3")
export const Scale = icon(JusticeScale01Icon, "Scale")
export const ScanLine = icon(ScanIcon, "ScanLine")
export const Search = icon(Search01Icon, "Search")
export const SearchIcon = icon(Search01Icon, "SearchIcon")
export const Server = icon(ServerStack01Icon, "Server")
export const Settings = icon(Settings01Icon, "Settings")
export const Settings2 = icon(FilterHorizontalIcon, "Settings2")
export const Shapes = icon(Shapes01Icon, "Shapes")
export const Share2 = icon(Share08Icon, "Share2")
export const Shield = icon(Shield01Icon, "Shield")
export const ShieldCheck = icon(SecurityCheckIcon, "ShieldCheck")
export const Shirt = icon(TShirtIcon, "Shirt")
export const Signal = icon(SignalGlyph, "Signal")
export const SignalHigh = icon(SignalHighGlyph, "SignalHigh")
export const SignalLow = icon(SignalLowGlyph, "SignalLow")
export const SignalMedium = icon(SignalMediumGlyph, "SignalMedium")
export const Siren = icon(SirenIcon, "Siren")
export const Skull = icon(SkullIcon, "Skull")
export const SlidersHorizontal = icon(
  SlidersHorizontalIcon,
  "SlidersHorizontal"
)
export const Sparkles = icon(SparklesIcon, "Sparkles")
export const Split = icon(SplitIcon, "Split")
export const Square = icon(SquareIcon, "Square")
export const SquareCheck = icon(CheckmarkSquare02Icon, "SquareCheck")
export const SquareCode = icon(SourceCodeSquareIcon, "SquareCode")
export const SquareEqual = icon(EqualSignSquareIcon, "SquareEqual")
export const Stamp = icon(StampIcon, "Stamp")
export const Strikethrough = icon(TextStrikethroughIcon, "Strikethrough")
export const Sun = icon(Sun03Icon, "Sun")
export const Table2 = icon(TableIcon, "Table2")
export const Tag = icon(Tag01Icon, "Tag")
export const Target = icon(Target02Icon, "Target")
export const Telescope = icon(TelescopeIcon, "Telescope")
export const Terminal = icon(ComputerTerminal01Icon, "Terminal")
export const Text = icon(TextIcon, "Text")
export const TextCursorInput = icon(InputTextIcon, "TextCursorInput")
export const TextQuote = icon(QuoteDownIcon, "TextQuote")
export const Timer = icon(Timer02Icon, "Timer")
export const Trash = icon(Delete02Icon, "Trash")
export const Trash2 = icon(Delete02Icon, "Trash2")
export const Triangle = icon(TriangleIcon, "Triangle")
export const TriangleAlert = icon(Alert02Icon, "TriangleAlert")
export const Trophy = icon(ChampionIcon, "Trophy")
export const Type = icon(TextFontIcon, "Type")
export const Undo2 = icon(Undo02Icon, "Undo2")
export const Ungroup = icon(UngroupIcon, "Ungroup")
export const Unlink = icon(Unlink04Icon, "Unlink")
export const Unplug = icon(UnplugIcon, "Unplug")
export const Upload = icon(Upload01Icon, "Upload")
export const User = icon(UserIcon, "User")
export const UserCheck = icon(UserCheck01Icon, "UserCheck")
export const UserMinus = icon(UserMinus01Icon, "UserMinus")
export const UserPlus = icon(UserAdd01Icon, "UserPlus")
export const UserRound = icon(UserIcon, "UserRound")
export const Users = icon(UserMultipleIcon, "Users")
export const Volume2 = icon(VolumeHighIcon, "Volume2")
export const VolumeX = icon(VolumeMute02Icon, "VolumeX")
export const Workflow = icon(WorkflowIcon, "Workflow")
export const Wrench = icon(Wrench01Icon, "Wrench")
export const X = icon(Cancel01Icon, "X")
export const XCircle = icon(CancelCircleIcon, "XCircle")
export const XIcon = icon(Cancel01Icon, "XIcon")
export const Zap = icon(FlashIcon, "Zap")
