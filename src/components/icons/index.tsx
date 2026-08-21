import type { ReactNode, SVGProps } from "react";

export type SportIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number | string;
  active?: boolean;
  strokeWidth?: number;
};

type IconDrawing = ReactNode | ((active: boolean) => ReactNode);

function createSportIcon(drawing: IconDrawing, activeLayer?: ReactNode) {
  return function SportIcon({
    size = 24,
    active = false,
    strokeWidth = 1.9,
    className,
    fill = "none",
    ...props
  }: SportIconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        fill={fill}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {active && activeLayer}
        {typeof drawing === "function" ? drawing(active) : drawing}
      </svg>
    );
  };
}

const navFill = <path d="M4.5 10.2 12 4.7l7.5 5.5v8.3a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5Z" fill="currentColor" opacity=".14" stroke="none" />;

export const Home = createSportIcon(
  <>
    <path d="M3.7 10.4 12 4.3l8.3 6.1" />
    <path d="M5.3 9.7v9.1c0 .7.5 1.2 1.2 1.2h11c.7 0 1.2-.5 1.2-1.2V9.7" />
    <path d="M9 20v-5.3h6V20M9 11.5h6M12 9.6v3.8" />
  </>,
  navFill,
);

export const ClipboardList = createSportIcon(
  <>
    <path d="m8 5-3 1.7-1.8 4.5 3 1.7V20h11.6v-7.1l3-1.7L19 6.7 16 5c-.5 1.7-1.9 2.7-4 2.7S8.5 6.7 8 5Z" />
    <path d="M9.2 12.2h5.6M9.2 15.2h5.6M12 7.7V20" opacity=".65" />
  </>,
  <path d="m8 5-3 1.7-1.8 4.5 3 1.7V20h11.6v-7.1l3-1.7L19 6.7 16 5c-.5 1.7-1.9 2.7-4 2.7S8.5 6.7 8 5Z" fill="currentColor" opacity=".14" stroke="none" />,
);

export const Trophy = createSportIcon(
  <>
    <path d="M7 4.2h10v3.7c0 3.2-2.1 5.7-5 5.7s-5-2.5-5-5.7Z" />
    <path d="M7 6H4.2v1.6c0 2 1.4 3.4 3.4 3.4M17 6h2.8v1.6c0 2-1.4 3.4-3.4 3.4M12 13.6v3.2M8.5 20h7M9.5 16.8h5" />
    <path d="m12 6.1.7 1.4 1.6.2-1.1 1.1.3 1.6-1.5-.8-1.5.8.3-1.6-1.1-1.1 1.6-.2Z" />
  </>,
  <path d="M7 4.2h10v3.7c0 3.2-2.1 5.7-5 5.7s-5-2.5-5-5.7Z" fill="currentColor" opacity=".16" stroke="none" />,
);

export const Users = createSportIcon(
  <>
    <circle cx="12" cy="8" r="3" />
    <circle cx="5.5" cy="10" r="2" />
    <circle cx="18.5" cy="10" r="2" />
    <path d="M6.5 19.5v-1.2c0-3 2.2-5.1 5.5-5.1s5.5 2.1 5.5 5.1v1.2M2.5 18.5v-.8c0-2.2 1.3-3.7 3.5-3.9M21.5 18.5v-.8c0-2.2-1.3-3.7-3.5-3.9" />
    <path d="M9.2 19.5v-2.1h5.6v2.1" opacity=".65" />
  </>,
  <path d="M6.5 19.5v-1.2c0-3 2.2-5.1 5.5-5.1s5.5 2.1 5.5 5.1v1.2Z" fill="currentColor" opacity=".14" stroke="none" />,
);

export const ArrowLeftRight = createSportIcon(
  <>
    <path d="M4 7.5h13.5M14.5 4.5l3 3-3 3M20 16.5H6.5M9.5 13.5l-3 3 3 3" />
    <circle cx="12" cy="12" r="2.1" fill="currentColor" opacity=".14" />
  </>,
  <path d="M4 7.5h13.5l-3-3 5 3-5 3 3-3H4ZM20 16.5H6.5l3 3-5-3 5-3-3 3H20Z" fill="currentColor" opacity=".12" stroke="none" />,
);

export const MoreHorizontal = createSportIcon(
  <>
    <path d="M5.2 8.1 12 4.2l6.8 3.9v7.8L12 19.8l-6.8-3.9Z" />
    <circle cx="8.2" cy="12" r=".8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
    <circle cx="15.8" cy="12" r=".8" fill="currentColor" stroke="none" />
  </>,
  <path d="M5.2 8.1 12 4.2l6.8 3.9v7.8L12 19.8l-6.8-3.9Z" fill="currentColor" opacity=".14" stroke="none" />,
);

export const Calendar = createSportIcon(<><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17M7 13h2M11 13h2M15 13h2M7 16.5h2M11 16.5h2" /></>);
export const CalendarDays = Calendar;
export const CalendarPlus = createSportIcon(<><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17M12 12.5v5M9.5 15h5" /></>);
export const Clock = createSportIcon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.3v5.2l3.5 2" /><path d="M8 3.8 6.8 2.5M16 3.8l1.2-1.3" opacity=".6" /></>);
export const Clock3 = Clock;
export const CircleDot = createSportIcon(<><path d="M4 17V8.5L7 5h10l3 3.5V17" /><path d="M4 17h16M8 17v-3.5h8V17" /><circle cx="12" cy="10" r="2.2" /><path d="m10.2 8.7-1.6-1M13.8 8.7l1.6-1" opacity=".6" /></>);
export const Football = createSportIcon(<><circle cx="12" cy="12" r="9" /><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2ZM10.1 12.7l-3 2.2M13.9 12.7l3 2.2M9 9.2 6.4 7.7M15 9.2l2.6-1.5M7.1 14.9l.8 3.1M16.9 14.9l-.8 3.1" /><path d="M7.9 18h8.2M4.2 11l2.2-3.3M19.8 11l-2.2-3.3" opacity=".65" /></>);
export const Stadium = createSportIcon(<><path d="M3.5 9.5 12 5l8.5 4.5v8.8H3.5Z" /><path d="M7 9.5v8.8M17 9.5v8.8M3.5 13h17M6 21h12" /><path d="M9.2 13v5.3M14.8 13v5.3" opacity=".6" /></>);
export const Target = createSportIcon(<><circle cx="11" cy="12" r="7.5" /><circle cx="11" cy="12" r="3.5" /><circle cx="11" cy="12" r=".8" fill="currentColor" stroke="none" /><path d="m15.5 7.5 4-3M16.7 4.3h2.8v2.8" /></>);
export const TrendingUp = createSportIcon(<><path d="M3.5 18.5 9 13l3.3 3.2L20.5 8" /><path d="M15.5 8h5v5" /><path d="M4 7.5h4M4 11h2" opacity=".55" /></>);
export const Medal = createSportIcon(<><path d="m8 3.5 4 6 4-6M9.5 3.5l2.5 4 2.5-4" /><circle cx="12" cy="14.5" r="5.2" /><path d="m12 11.7.8 1.6 1.8.2-1.3 1.2.4 1.8-1.7-.9-1.7.9.4-1.8-1.3-1.2 1.8-.2Z" /></>);
export const Crown = createSportIcon(<><path d="m4 7 4.3 3.5L12 5l3.7 5.5L20 7l-1.4 10H5.4Z" /><path d="M5.4 17h13.2M6 20h12" /></>);
export const Flag = createSportIcon(<><path d="M5 21V4M5 5h11l-1.8 3L17 11H5" /><path d="M8 8h3M8 14v4" opacity=".55" /></>);
export const Handshake = createSportIcon(<><path d="m3.5 9 4-3 3 2.2 3-2.2 7 5.5-2.4 3.2-5.6 4.3-2-1.7-1.7.8-3-2.8Z" /><path d="m8 11 3.2 2.8c.7.6 1.7.6 2.3-.1l1-1.1M6.5 14l2 1.8M15 9l-2.3 2" /></>);
export const Shield = createSportIcon(<><path d="M12 3.2 19 6v5.2c0 4.4-2.8 7.8-7 9.6-4.2-1.8-7-5.2-7-9.6V6Z" /><path d="M8.5 10.3h7M12 7.5v5.6" opacity=".65" /></>);
export const ShieldCheck = createSportIcon(<><path d="M12 3.2 19 6v5.2c0 4.4-2.8 7.8-7 9.6-4.2-1.8-7-5.2-7-9.6V6Z" /><path d="m8.5 12 2.2 2.1 4.8-5" /></>);
export const ShieldX = createSportIcon(<><path d="M12 3.2 19 6v5.2c0 4.4-2.8 7.8-7 9.6-4.2-1.8-7-5.2-7-9.6V6Z" /><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" /></>);
export const Swords = createSportIcon(<><path d="m4 4 7 7M7 3H3v4M20 4l-7 7M17 3h4v4M9.5 13.5 5 18l-2 3 3-2 4.5-4.5M14.5 13.5 19 18l2 3-3-2-4.5-4.5" /></>);

export const UserRound = createSportIcon(<><circle cx="12" cy="8" r="3.3" /><path d="M5.5 20v-1.6c0-3.4 2.5-5.7 6.5-5.7s6.5 2.3 6.5 5.7V20" /><path d="M9 19.8v-2.2h6v2.2" opacity=".6" /></>);
export const UserPlus = createSportIcon(<><circle cx="9.5" cy="8" r="3.2" /><path d="M3.5 20v-1.5c0-3.5 2.3-5.8 6-5.8 2.2 0 3.9.8 5 2.2M18 10v6M15 13h6" /></>);
export const UserRoundPlus = UserPlus;
export const UsersRound = Users;

export const Camera = createSportIcon(<><path d="M4 7.5h3l1.4-2h7.2l1.4 2h3c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5H4c-.8 0-1.5-.7-1.5-1.5V9c0-.8.7-1.5 1.5-1.5Z" /><circle cx="12" cy="13.5" r="3.8" /><circle cx="18" cy="10" r=".7" fill="currentColor" stroke="none" /></>);
export const Image = createSportIcon(<><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4.5 17 4.3-4.3 3.2 3.1 2.5-2.5 5 4.7" /></>);
export const ImagePlus = createSportIcon(<><rect x="3" y="4" width="14" height="16" rx="2.5" /><circle cx="8" cy="9" r="1.5" /><path d="m4.5 17 4-4 3 3 2-2 3.5 3.5M20 7v6M17 10h6" /></>);
export const FileText = createSportIcon(<><path d="M6 3.5h8l4 4V20H6Z" /><path d="M14 3.5V8h4M9 12h6M9 15h6M9 18h4" /></>);
export const Download = createSportIcon(<><path d="M12 3.5v11M8 11l4 4 4-4M4 19.5h16" /></>);
export const Share2 = createSportIcon(<><circle cx="18" cy="5" r="2.2" /><circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="19" r="2.2" /><path d="m8 11 8-4.7M8 13l8 4.7" /></>);
export const Copy = createSportIcon(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
export const Save = createSportIcon(<><path d="M4 4h13l3 3v13H4Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>);

export const Mail = createSportIcon(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>);
export const MailCheck = createSportIcon(<><rect x="3" y="5" width="14" height="14" rx="2.5" /><path d="m4 7 6 4.5L16 7M16 15l2 2 3.5-4" /></>);
export const Bell = createSportIcon(<><path d="M6.5 10.5c0-3.5 2.1-6 5.5-6s5.5 2.5 5.5 6v3.2l2 3.3h-15l2-3.3Z" /><path d="M9.5 20h5M10 17v.5a2 2 0 0 0 4 0V17M12 2.5v2" /><path d="M7.2 7 5.5 5.5M16.8 7l1.7-1.5" opacity=".6" /></>);
export const Lock = createSportIcon(<><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v3" /></>);
export const LockKeyhole = createSportIcon(<><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /><circle cx="12" cy="14.5" r="1" /><path d="M12 15.5v2" /></>);
export const LogIn = createSportIcon(<><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M13 8l4 4-4 4M8 12h9" /></>);
export const LogOut = createSportIcon(<><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M11 8l-4 4 4 4M16 12H7" /></>);

export const Plus = createSportIcon(<path d="M12 4v16M4 12h16" />);
export const Minus = createSportIcon(<path d="M4 12h16" />);
export const X = createSportIcon(<path d="m5 5 14 14M19 5 5 19" />);
export const Check = createSportIcon(<path d="m4.5 12.5 4.5 4.3L19.5 6.5" />);
export const CheckCircle2 = createSportIcon(<><circle cx="12" cy="12" r="9" /><path d="m7.5 12.3 3 3 6-6.5" /></>);
export const ChevronRight = createSportIcon(<path d="m9 5 7 7-7 7" />);
export const ChevronDown = createSportIcon(<path d="m5 9 7 7 7-7" />);
export const ArrowLeft = createSportIcon(<><path d="M20 12H4M10 6l-6 6 6 6" /></>);
export const ArrowUp = createSportIcon(<><path d="M12 20V4M6 10l6-6 6 6" /></>);
export const ArrowDown = createSportIcon(<><path d="M12 4v16M6 14l6 6 6-6" /></>);
export const Play = createSportIcon(<path d="m8 5 11 7-11 7Z" />);
export const Pause = createSportIcon(<><path d="M8 5v14M16 5v14" /></>);
export const RotateCcw = createSportIcon(<><path d="M5 7V3M5 7h4M5.5 6.5A8 8 0 1 1 4 15" /></>);
export const Loader2 = createSportIcon(<><path d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9" /><path d="M18.4 5.6 20 4M4 20l1.6-1.6" opacity=".45" /></>);

export const Sliders = createSportIcon(<><path d="M4 6h6M14 6h6M4 12h10M18 12h2M4 18h2M10 18h10" /><circle cx="12" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>);
export const SlidersHorizontal = Sliders;
export const Search = createSportIcon(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>);
export const PencilLine = createSportIcon(<><path d="m4 17-.7 3.7L7 20l11-11-3-3Z" /><path d="m13.5 7.5 3 3M10 20h10" /></>);
export const Trash2 = createSportIcon(<><path d="M4.5 7h15M9 3.5h6L16 7H8ZM6.5 7l1 13h9l1-13M10 11v5M14 11v5" /></>);
export const AlertTriangle = createSportIcon(<><path d="M12 3.5 21 20H3Z" /><path d="M12 9v5M12 17.2v.2" /></>);
export const Radio = createSportIcon(<><circle cx="12" cy="12" r="2.2" fill="currentColor" opacity=".22" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" /></>);
export const MapPin = createSportIcon(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>);
export const ExternalLink = createSportIcon(<><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>);
export const Sparkles = createSportIcon(<><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2ZM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7ZM5.5 13l.8 2.7 2.7.8-2.7.8L5.5 20l-.8-2.7-2.7-.8 2.7-.8Z" /></>);
export const ZoomIn = createSportIcon(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></>);
export const HelpCircle = createSportIcon(<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></>);
export const Info = HelpCircle;
export const TrendingDown = createSportIcon(<><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></>);
export const History = createSportIcon(<><path d="M4.5 8.5V4.2M4.5 8.5h4.3" /><path d="M5.3 7.2A8.5 8.5 0 1 1 4 15" /><path d="M12 7.5v5l3.2 2" /></>);
export const ShoppingCart = createSportIcon(<><path d="M3.5 5h2l1.8 10.2h9.8l2.2-7H6.1" /><circle cx="9" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /><path d="M9 11h7.8M12.5 8.3v6.9" opacity=".6" /></>);
export const Cards = createSportIcon(<><rect x="5" y="3.5" width="12" height="17" rx="2.2" transform="rotate(-5 11 12)" /><path d="M9 7.5h4.5M8.5 11h5.5M9 14.5h3.5" /><path d="M17.2 6.2 20 7v12.3L15.5 21" opacity=".6" /></>);
export const Shirt = createSportIcon(<><path d="m8 4-4 2.4-1.5 4.3 3 1.7V20h13v-7.6l3-1.7L20 6.4 16 4c-.5 1.8-1.8 2.8-4 2.8S8.5 5.8 8 4Z" /><path d="M9.2 11.5h5.6M12 8.3V20" opacity=".55" /></>);
export const Eye = createSportIcon(<><path d="M2.7 12s3.3-5.5 9.3-5.5 9.3 5.5 9.3 5.5-3.3 5.5-9.3 5.5S2.7 12 2.7 12Z" /><circle cx="12" cy="12" r="2.6" /></>);
export const Package = createSportIcon(<><path d="m4 7.5 8-4 8 4v9l-8 4-8-4Z" /><path d="m4 7.5 8 4 8-4M12 11.5v9M8 5.5l8 4" /><path d="M8.2 13.7 10 14.6" opacity=".6" /></>);
