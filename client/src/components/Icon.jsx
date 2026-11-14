import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUpRightFromSquare,
  faBell,
  faBoxArchive,
  faCheck,
  faChevronDown,
  faChevronUp,
  faCircleCheck,
  faCircleXmark,
  faEye,
  faEyeSlash,
  faFileLines,
  faGaugeHigh,
  faIdCard,
  faInbox,
  faKey,
  faLandmark,
  faMagnifyingGlass,
  faPen,
  faPenToSquare,
  faPlus,
  faRightFromBracket,
  faScaleBalanced,
  faSliders,
  faTrash,
  faTriangleExclamation,
  faUsers,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

// Набор иконок интерфейса (FontAwesome Solid). Имена — по смыслу, а не по картинке.
const ICONS = {
  emblem: faScaleBalanced,
  home: faGaugeHigh,
  appeals: faInbox,
  docs: faFileLines,
  general: faLandmark,
  templates: faPenToSquare,
  staff: faUsers,
  profile: faIdCard,
  admin: faSliders,
  logout: faRightFromBracket,
  warning: faTriangleExclamation,
  search: faMagnifyingGlass,
  trash: faTrash,
  show: faEye,
  hide: faEyeSlash,
  key: faKey,
  expand: faChevronDown,
  collapse: faChevronUp,
  external: faArrowUpRightFromSquare,
  edit: faPen,
  check: faCheck,
  close: faXmark,
  archive: faBoxArchive,
  add: faPlus,
  notify: faBell,
  ok: faCircleCheck,
  fail: faCircleXmark,
};

export default function Icon({ name, className = '', title }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <FontAwesomeIcon
      icon={icon}
      className={`icon ${className}`.trim()}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}
