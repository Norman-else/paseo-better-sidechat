import { findSvgIconProblem } from "@getpaseo/plugin";
import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import type { DefaultPermissionMode } from "./settings";

export const CLAUDE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>';

export const CODEX_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"/></svg>';

export const COPILOT_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 416" fill="currentColor"><path d="M181.33 266.143c0-11.497 9.32-20.818 20.818-20.818 11.498 0 20.819 9.321 20.819 20.818v38.373c0 11.497-9.321 20.818-20.819 20.818-11.497 0-20.818-9.32-20.818-20.818v-38.373zM308.807 245.325c-11.477 0-20.798 9.321-20.798 20.818v38.373c0 11.497 9.32 20.818 20.798 20.818 11.497 0 20.818-9.32 20.818-20.818v-38.373c0-11.497-9.32-20.818-20.818-20.818z" fill-rule="nonzero"/><path d="M512.002 246.393v57.384c-.02 7.411-3.696 14.638-9.67 19.011C431.767 374.444 344.695 416 256 416c-98.138 0-196.379-56.542-246.33-93.21-5.975-4.374-9.65-11.6-9.671-19.012v-57.384a35.347 35.347 0 016.857-20.922l15.583-21.085c8.336-11.312 20.757-14.31 33.98-14.31 4.988-56.953 16.794-97.604 45.024-127.354C155.194 5.77 226.56 0 256 0c29.441 0 100.807 5.77 154.557 62.722 28.19 29.75 40.036 70.401 45.025 127.354 13.263 0 25.602 2.936 33.958 14.31l15.583 21.127c4.476 6.077 6.878 13.345 6.878 20.88zm-97.666-26.075c-.677-13.058-11.292-18.19-22.338-21.824-11.64 7.309-25.848 10.183-39.46 10.183-14.454 0-41.432-3.47-63.872-25.869-5.667-5.625-9.527-14.454-12.155-24.247a212.902 212.902 0 00-20.469-1.088c-6.098 0-13.099.349-20.551 1.088-2.628 9.793-6.509 18.622-12.155 24.247-22.4 22.4-49.418 25.87-63.872 25.87-13.612 0-27.86-2.855-39.501-10.184-11.005 3.613-21.558 8.828-22.277 21.824-1.17 24.555-1.272 49.11-1.375 73.645-.041 12.318-.082 24.658-.288 36.976.062 7.166 4.374 13.818 10.882 16.774 52.97 24.124 103.045 36.278 149.137 36.278 46.01 0 96.085-12.154 149.014-36.278 6.508-2.956 10.84-9.608 10.881-16.774.637-36.832.124-73.809-1.642-110.62h.041zM107.521 168.97c8.643 8.623 24.966 14.392 42.56 14.392 13.448 0 39.03-2.874 60.156-24.329 9.28-8.951 15.05-31.35 14.413-54.079-.657-18.231-5.769-33.28-13.448-39.665-8.315-7.371-27.203-10.574-48.33-8.644-22.399 2.238-41.267 9.588-50.875 19.833-20.798 22.728-16.323 80.317-4.476 92.492zm130.556-56.008c.637 3.51.965 7.35 1.273 11.517 0 2.875 0 5.77-.308 8.952 6.406-.636 11.847-.636 16.959-.636s10.553 0 16.959.636c-.329-3.182-.329-6.077-.329-8.952.329-4.167.657-8.007 1.294-11.517-6.735-.637-12.812-.965-17.924-.965s-11.21.328-17.924.965zm49.275-8.008c-.637 22.728 5.133 45.128 14.413 54.08 21.105 21.454 46.708 24.328 60.155 24.328 17.596 0 33.918-5.769 42.561-14.392 11.847-12.175 16.322-69.764-4.476-92.492-9.608-10.245-28.476-17.595-50.875-19.833-21.127-1.93-40.015 1.273-48.33 8.644-7.679 6.385-12.791 21.434-13.448 39.665z"/></svg>';

export const OPENCODE_ICON_SVG =
  '<svg viewBox="0 0 54 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 30H0V0H24V6H6V24H18V18H12V12H24V30Z" fill="currentColor"/><path d="M12 18H18V24H6V12H12V18Z" fill="currentColor" fill-opacity="0.4"/><path d="M48 12V24H36V12H48Z" fill="currentColor" fill-opacity="0.4"/><path d="M54 30H30V0H54V30ZM36 24H48V6H36V24Z" fill="currentColor"/></svg>';

export const ANTIGRAVITY_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path transform="translate(12 12) scale(0.24) translate(-55.738 -56.945)" d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z"/></svg>';

export const CURSOR_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 466.73 532.09" fill="currentColor"><path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"/></svg>';

export const KIMI_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.514 7.342C19.711 7.862 19.814 8.413 19.816 8.969C19.816 12.494 15.998 14.697 12.946 12.934C11.529 12.116 10.657 10.605 10.657 8.969C10.657 5.646 14.085 3.431 17.115 4.793C15.26 3.373 12.99 2.607 10.655 2.612C4.772 2.614 0.005 7.381 0 13.265C0.002 19.148 4.772 23.918 10.655 23.92C16.538 23.916 21.306 19.147 21.31 13.265C21.312 11.155 20.687 9.095 19.514 7.342ZM14.841 4.666C14.841 8.191 18.657 10.395 21.709 8.632C23.127 7.814 24 6.302 24 4.666C24 1.14 20.184-1.061 17.13 0.699C15.714 1.519 14.841 3.03 14.841 4.666"/></svg>';

export const MINIMAX_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z"/></svg>';

export const GROK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M9 13v2M15 13v2"/></svg>';

export const ZAI_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" fill-rule="evenodd"><path d="M8.07 1.333L6.618 3.302H.435L1.887 1.333h6.184zM15.503 12.699L14.052 14.667h-6.161l1.449-1.968h6.163zM16 1.333L6.176 14.667H0L9.824 1.333H16z"/></svg>';

export const FX_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="166.241 0 155.861 155.75" fill="currentColor"><path d="M237.892 0C243.178 8.73262e-05 249.383 1.41857 253.025 3.07422L255.093 4.01367L250.076 18.6299L247.677 17.7461C244.901 16.7234 241.938 15.7998 238.491 15.7998C234.984 15.7998 232.787 16.5601 231.08 18.3213C229.231 20.2297 227.629 23.6395 226.229 29.7578L226.227 29.7617L226.228 29.7627L225.136 34.8506H241.669L260.432 34.9502L260.694 34.9512L260.842 35.1689L278.854 61.6328L296.736 34.9502H320.866L291.676 76.7402L322.102 119.75H299.331L299.182 119.546L241.144 40.4775L239.35 49.4004H222.069L205.688 127.208C203.927 135.709 201.185 142.838 196.777 147.866C192.27 153.008 186.201 155.75 178.342 155.75C174.181 155.75 170.746 155.109 167.909 154.107L166.241 153.519V137.182L166.899 137.4L169.531 138.278C172.182 139.162 174.414 139.8 177.142 139.8C178.528 139.8 179.703 139.526 180.732 138.98C181.764 138.434 182.677 137.6 183.52 136.442C185.304 133.989 186.716 130.135 187.897 124.672L203.76 49.4004H189.874L191.759 39.4375L192.039 39.3457L206.818 34.4668L208.154 28.6416C210.516 18.2065 213.772 10.9381 218.708 6.31836C223.737 1.61217 230.127 3.08752e-05 237.892 0ZM273.987 99.084L260.073 120.25H234.541L261.003 82.0215L273.987 99.084Z"/></svg>';

export const HOPLITE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="1.394 1.679 8.494 7.828" fill="currentColor"><path d="M8.237 7.813C8.276 7.789 8.327 7.796 8.358 7.83L9.741 9.346C9.797 9.407 9.754 9.506 9.671 9.507H8.977C8.924 9.507 8.881 9.463 8.881 9.41V9.125C8.881 9.089 8.861 9.057 8.83 9.04L7.589 8.379C7.524 8.344 7.521 8.251 7.584 8.212L8.237 7.813ZM3.944 1.679C4.502 1.679 5.052 1.82 5.54 2.09L5.962 2.323C6.024 2.358 6.029 2.446 5.97 2.486L5.091 3.09C5.065 3.108 5.05 3.137 5.05 3.169V3.495C5.05 3.529 5.032 3.561 5.003 3.578L4.68 3.769C4.594 3.82 4.498 3.722 4.549 3.637L4.592 3.566C4.63 3.502 4.584 3.421 4.51 3.421H4.028C3.925 3.421 3.894 3.562 3.989 3.604L4.377 3.775C4.448 3.806 4.455 3.904 4.389 3.944L3.77 4.323C3.755 4.332 3.737 4.337 3.72 4.337H3.361C3.309 4.337 3.268 4.379 3.268 4.431C3.268 4.484 3.309 4.526 3.361 4.526H3.779C3.797 4.526 3.814 4.521 3.829 4.513L7.599 2.272C8.135 1.954 8.815 2.008 9.294 2.407C9.307 2.418 9.314 2.434 9.314 2.451V2.729C9.315 2.812 9.413 2.856 9.475 2.8L9.728 2.57C9.789 2.514 9.888 2.558 9.888 2.641V5.812C9.888 5.865 9.845 5.908 9.792 5.908H9.359C9.331 5.908 9.303 5.895 9.285 5.873L8.374 4.773C8.337 4.728 8.268 4.728 8.229 4.771L7.468 5.625C7.429 5.669 7.438 5.737 7.487 5.769L9.038 6.776C9.098 6.815 9.096 6.903 9.035 6.939L6.618 8.363C6.556 8.4 6.478 8.358 6.474 8.286L6.439 7.633C6.437 7.578 6.48 7.532 6.535 7.532H6.925C6.948 7.532 6.971 7.523 6.988 7.508L7.211 7.31C7.276 7.252 7.236 7.144 7.148 7.142L5.991 7.118H1.49C1.437 7.118 1.394 7.075 1.394 7.022V3.308C1.394 3.255 1.437 3.212 1.49 3.212H2.544C2.597 3.212 2.64 3.169 2.64 3.116V2.969C2.64 2.916 2.597 2.873 2.544 2.873H1.461C1.366 2.873 1.329 2.75 1.408 2.697L2.134 2.221C2.672 1.867 3.301 1.679 3.944 1.679Z"/></svg>';

export const MUSE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path transform="scale(0.24)" d="M24.6257 16.1214C28.2365 16.1214 30.8187 18.9408 30.8187 23.3643C30.8185 27.7868 30.1055 31.7765 28.9225 40.2466C28.0743 46.1813 26.62 55.2418 26.0132 59.0088C27.1782 56.7815 29.9074 51.5757 30.3914 50.5982C36.1081 39.061 42.0657 28.7544 43.7826 26.0254C46.0594 22.382 48.062 20.9229 51.1597 20.9229C52.7685 20.923 54.6826 21.7357 55.6315 22.819C56.9178 24.2895 57.1859 26.6602 57.1411 29.244C57.0738 33.2073 56.5599 39.5264 55.8553 46.5698C55.5416 49.7057 54.9365 56.1066 54.5288 60.4004C58.1883 53.8532 64.9609 41.8109 67.6921 37.6058C70.0727 33.9402 72.466 31.5797 75.6836 31.5796C78.4595 31.5796 81.8809 33.5416 81.6772 38.7573C81.3774 46.4556 80.2673 63.2232 79.7607 70.7479C83.1662 65.7913 87.6377 58.4543 89.3148 55.6966C91.0104 52.908 92.75 50.6542 95.3898 50.5778C98.0987 50.4995 99.913 52.341 99.9959 55.1839C100.078 58.0277 98.3835 61.2256 96.1344 64.856C93.6937 68.7957 90.9621 73.0123 87.6383 76.9491C84.3148 80.8856 81.2604 83.8782 76.5991 83.8786C72.4243 83.8786 69.4869 81.1043 69.283 76.0254C69.1768 73.364 69.6804 67.6405 70.0602 63.1673C70.5 57.9875 71.0315 52.9861 71.403 49.6786C67.7337 56.3979 60.0101 70.4676 56.5348 75.9603C53.1343 81.3339 51.4774 83.2269 47.8882 83.2275C44.2977 83.2275 42.7226 80.6416 42.6717 76.7497C42.6142 72.5285 45.7852 47.1821 46.8587 38.737C45.1183 42.4616 40.839 51.6056 38.1551 57.0435C35.5587 62.3055 31.204 71.3978 28.0436 76.6357C25.7668 80.4094 23.2092 83.2273 19.4173 83.2275C15.6252 83.2275 13.4847 80.6784 13.4847 76.5788C13.4847 72.4794 14.6716 65.6492 15.9465 57.1777C16.5839 53.0781 17.3108 48.6133 18.1315 43.8761C18.7324 40.448 19.7764 34.4169 20.4183 30.7129C17.502 35.2539 12.2536 43.4278 10.6567 45.8903C8.88113 48.6291 7.28747 50.626 4.64681 50.6266C1.7329 50.6266 0.000532901 48.3522 0 45.7113C0 43.0703 1.34323 41.0344 3.52376 37.4512C6.32403 32.8465 11.3578 26.57 14.1154 23.2747C17.3656 19.3912 20.6139 16.1219 24.6257 16.1214Z"/></svg>';

export const BUILTIN_PROVIDER_SVGS: Readonly<Record<string, string>> = {
  claude: CLAUDE_ICON_SVG,
  codex: CODEX_ICON_SVG,
  openai: CODEX_ICON_SVG,
  copilot: COPILOT_ICON_SVG,
  opencode: OPENCODE_ICON_SVG,
  antigravity: ANTIGRAVITY_ICON_SVG,
  agy: ANTIGRAVITY_ICON_SVG,
  cursor: CURSOR_ICON_SVG,
  kimi: KIMI_ICON_SVG,
  minimax: MINIMAX_ICON_SVG,
  "minimax-code": MINIMAX_ICON_SVG,
  grok: GROK_ICON_SVG,
  zai: ZAI_ICON_SVG,
  "glm-acp-agent": ZAI_ICON_SVG,
  fx: FX_ICON_SVG,
  hoplite: HOPLITE_ICON_SVG,
  muse: MUSE_ICON_SVG,
};

const KNOWN_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  claude: "Claude",
  codex: "Codex",
  copilot: "GitHub Copilot",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  cursor: "Cursor",
  kimi: "Kimi",
  minimax: "MiniMax",
  "minimax-code": "MiniMax Code",
  grok: "Grok",
  zai: "Z.ai",
  fx: "FX",
  hoplite: "Hoplite",
  muse: "Muse",
  omp: "OMP",
  pi: "Pi",
};

export function resolveProviderIconSvg(
  providerId: string | null | undefined,
  customIconSvg?: string | null,
): string | null {
  if (customIconSvg && findSvgIconProblem(customIconSvg) === null) {
    return customIconSvg;
  }
  if (!providerId) return null;
  const key = providerId.trim().toLowerCase();
  if (!key) return null;
  if (key in BUILTIN_PROVIDER_SVGS) return BUILTIN_PROVIDER_SVGS[key];
  for (const [prefix, svg] of Object.entries(BUILTIN_PROVIDER_SVGS)) {
    if (key.startsWith(`${prefix}-`) || key.startsWith(`${prefix}_`)) {
      return svg;
    }
  }
  return null;
}

export function formatProviderLabel(
  providerId: string | null | undefined,
  rawLabel?: string | null,
): string {
  if (rawLabel && rawLabel.trim()) return rawLabel.trim();
  if (!providerId) return "AI";
  const key = providerId.trim().toLowerCase();
  if (key in KNOWN_PROVIDER_LABELS) return KNOWN_PROVIDER_LABELS[key];
  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Strips redundant provider brand prefixes (e.g. "Claude Opus 5.5" -> "Opus 5.5",
 * "OpenAI GPT-5.4" -> "GPT-5.4", "claude-sonnet-4-5-20250929" -> "Sonnet 4.5")
 * to match Paseo's compact model pill across all providers.
 */
export function formatShortModelLabel(labelOrId: string | null | undefined, fallback = "Model"): string {
  if (!labelOrId) return fallback;
  const trimmed = labelOrId.trim();
  if (!trimmed) return fallback;

  const strippedBrand = trimmed.replace(
    /^(?:Anthropic\s+Claude|Claude|OpenAI\s+Codex|OpenAI|GitHub\s+Copilot)\s+/i,
    "",
  );
  if (strippedBrand !== trimmed && strippedBrand.length > 0) {
    return strippedBrand;
  }

  const claudeSlug = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(trimmed);
  if (claudeSlug) {
    const family = claudeSlug[1][0].toUpperCase() + claudeSlug[1].slice(1).toLowerCase();
    const ver = claudeSlug[3] ? `${claudeSlug[2]}.${claudeSlug[3]}` : claudeSlug[2];
    return `${family} ${ver}`;
  }

  return trimmed;
}

export function formatShortThinkingLabel(
  labelOrId: string | null | undefined,
  fallback = "Default",
): string {
  if (!labelOrId) return fallback;
  const cleaned = labelOrId
    .trim()
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(/\s+(?:thinking|effort|reasoning)$/i, "")
    .trim();
  if (!cleaned) return fallback;
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

export function resolveModeIconName(
  modeId: string | null | undefined,
  explicitIcon?: string | null,
): string {
  if (explicitIcon && explicitIcon.trim()) {
    return explicitIcon.trim();
  }
  switch (modeId) {
    case "plan":
    case "https://agentclientprotocol.com/protocol/session-modes#plan":
      return "ShieldEllipsis";
    case "default":
    case "ask":
    case "build":
    case "https://agentclientprotocol.com/protocol/session-modes#agent":
      return "Shield";
    case "acceptEdits":
      return "ShieldPlus";
    case "write":
      return "ShieldAlert";
    case "bypassPermissions":
    case "full-access":
    case "allow-all":
    case "full":
      return "ShieldOff";
    case "auto":
    case "auto-review":
    default:
      return "ShieldCheck";
  }
}

export function formatShortModeLabel(
  modeId: string | null | undefined,
  rawLabel?: string | null,
): string {
  switch (modeId) {
    case "bypassPermissions":
      return "Bypass";
    case "full-access":
    case "full":
      return "Full Access";
    case "allow-all":
      return "Allow All";
    case "auto-review":
      return "Auto-review";
    case "auto":
      return rawLabel && /default/i.test(rawLabel) ? "Default" : "Auto";
    case "plan":
    case "https://agentclientprotocol.com/protocol/session-modes#plan":
      return "Plan";
    case "https://agentclientprotocol.com/protocol/session-modes#agent":
      return "Agent";
    case "build":
      return "Build";
    case "write":
      return "Write";
    case "default":
    case "ask":
      return "Ask";
    case "acceptEdits":
      return "Edits";
    default: {
      if (!rawLabel) return modeId || "Auto";
      return (
        rawLabel
          .replace(/\s+(?:mode|permissions)$/i, "")
          .trim() || rawLabel
      );
    }
  }
}

/**
 * Resolves a valid permission/session `modeId` for ANY Paseo provider (`claude`, `codex`,
 * `copilot`, `opencode`, `kimi`, `omp`, custom ACP providers, etc.), returning `undefined`
 * when a provider defines no modes.
 */
export function resolveEffectiveProviderMode(input: {
  provider: string;
  requestedModeId?: string | null;
  parentProvider?: string | null;
  parentModeId?: string | null;
  defaultPermissionMode: DefaultPermissionMode;
  availableModes?: ReadonlyArray<{ id: string }>;
  providerDefaultModeId?: string | null;
}): string | undefined {
  const modes = input.availableModes;
  const hasKnownModes = Array.isArray(modes);
  if (hasKnownModes && modes.length === 0) {
    return undefined;
  }

  const isSupported = (candidate: string | null | undefined): candidate is string => {
    if (!candidate) return false;
    if (!hasKnownModes) return true;
    return modes.some((m) => m.id === candidate);
  };

  if (isSupported(input.requestedModeId)) {
    return input.requestedModeId;
  }

  const fallbackDefault =
    (isSupported(input.providerDefaultModeId) ? input.providerDefaultModeId : undefined) ??
    (hasKnownModes ? modes[0]?.id : input.provider === "claude" ? "auto" : undefined);

  const findFirstMatching = (candidates: readonly string[]): string | undefined => {
    for (const c of candidates) {
      if (isSupported(c)) return c;
    }
    return undefined;
  };

  switch (input.defaultPermissionMode) {
    case "inherit": {
      if (input.parentProvider === input.provider && isSupported(input.parentModeId)) {
        return input.parentModeId;
      }
      return fallbackDefault;
    }
    case "plan":
      return (
        findFirstMatching([
          "plan",
          "https://agentclientprotocol.com/protocol/session-modes#plan",
        ]) ?? fallbackDefault
      );
    case "bypassPermissions":
      return (
        findFirstMatching(["bypassPermissions", "full-access", "allow-all", "full"]) ??
        fallbackDefault
      );
    case "default":
      return (
        findFirstMatching([
          "default",
          "ask",
          "auto",
          "https://agentclientprotocol.com/protocol/session-modes#agent",
        ]) ?? fallbackDefault
      );
    case "auto":
    default:
      return (
        findFirstMatching([
          "auto",
          "auto-review",
          "build",
          "https://agentclientprotocol.com/protocol/session-modes#agent",
        ]) ?? fallbackDefault
      );
  }
}

export type ComposerToolbarDensity = "full" | "condensed" | "iconOnly";

export function resolveToolbarDensity(
  panelWidth: number,
  isTouchCompact: boolean,
): ComposerToolbarDensity {
  if (panelWidth > 0 && panelWidth < 340) return "iconOnly";
  if (isTouchCompact || (panelWidth > 0 && panelWidth < 430)) return "condensed";
  return "full";
}

function sanitizeSvgColor(color: string, fallback: string): string {
  const trimmed = color.trim();
  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(trimmed) ? trimmed : fallback;
}

export function resolveContextUsageRatio(
  usage: AgentUsage | null | undefined,
  fallbackMaxTokens?: number | null,
): {
  usedTokens: number;
  maxTokens: number;
  ratio: number;
} {
  const maxTokens = usage?.contextWindowMaxTokens ?? fallbackMaxTokens ?? 200_000;
  const usedTokens =
    usage?.contextWindowUsedTokens ??
    ((usage?.inputTokens ?? 0) + (usage?.cachedInputTokens ?? 0) + (usage?.outputTokens ?? 0));
  const safeMax = maxTokens > 0 ? maxTokens : 200_000;
  const safeUsed = Math.max(0, usedTokens);
  const ratio = Math.max(0, Math.min(1, safeUsed / safeMax));
  return { usedTokens: safeUsed, maxTokens: safeMax, ratio };
}

export function buildContextRingSvg(input: {
  ratio: number;
  trackColor: string;
  progressColor: string;
}): string {
  const radius = 8.5;
  const circumference = 2 * Math.PI * radius;
  const effectiveRatio = input.ratio > 0 ? Math.max(0.06, Math.min(1, input.ratio)) : 0.06;
  const dash = (circumference * effectiveRatio).toFixed(2);
  const gap = (circumference - Number(dash)).toFixed(2);
  const track = sanitizeSvgColor(input.trackColor, "#3f3f46");
  const fill = sanitizeSvgColor(input.progressColor, "#a1a1aa");

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">',
    `<circle cx="12" cy="12" r="${radius}" stroke="${track}" stroke-width="2.4" opacity="0.45"/>`,
    `<circle cx="12" cy="12" r="${radius}" stroke="${fill}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${dash} ${gap}" transform="rotate(-90 12 12)"/>`,
    "</svg>",
  ].join("");
}

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k`;
  return String(tokens);
}

export function formatContextUsageSummary(
  usage: AgentUsage | null | undefined,
  fallbackMaxTokens?: number | null,
): string {
  const { usedTokens, maxTokens, ratio } = resolveContextUsageRatio(usage, fallbackMaxTokens);
  const pct = Math.round(ratio * 100);
  const costPart =
    usage?.totalCostUsd !== undefined && usage.totalCostUsd > 0
      ? ` · $${usage.totalCostUsd.toFixed(usage.totalCostUsd < 0.01 ? 4 : 2)}`
      : "";
  return `Context: ${formatCompactTokens(usedTokens)} / ${formatCompactTokens(maxTokens)} (${pct}%)${costPart}`;
}
