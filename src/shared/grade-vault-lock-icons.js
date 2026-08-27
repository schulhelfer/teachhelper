const svg = (content) => `
  <svg class="grade-vault-lock-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false">
    ${content}
  </svg>`;

export const GRADE_VAULT_LOCKED_ICON = svg(`
  <defs>
    <linearGradient id="grade-vault-locked-body" x1="206" y1="385" x2="800" y2="932" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFE66A"/>
      <stop offset="0.35" stop-color="#FFC54E"/>
      <stop offset="0.72" stop-color="#FFA34B"/>
      <stop offset="1" stop-color="#FF8550"/>
    </linearGradient>
    <radialGradient id="grade-vault-locked-body-glow" cx="0" cy="0" r="1" gradientTransform="translate(446 426) rotate(47) scale(480 425)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF5A4" stop-opacity="0.78"/>
      <stop offset="1" stop-color="#FFF5A4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="grade-vault-locked-shackle" x1="345" y1="96" x2="700" y2="370" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F7F7FA"/>
      <stop offset="0.28" stop-color="#C9C7D2"/>
      <stop offset="0.57" stop-color="#EFEFF3"/>
      <stop offset="0.83" stop-color="#B486C9"/>
      <stop offset="1" stop-color="#9B63BB"/>
    </linearGradient>
    <linearGradient id="grade-vault-locked-rim" x1="512" y1="350" x2="512" y2="969" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF09A" stop-opacity="0.84"/>
      <stop offset="0.78" stop-color="#F58A60" stop-opacity="0"/>
      <stop offset="1" stop-color="#E96768" stop-opacity="0.65"/>
    </linearGradient>
  </defs>
  <rect x="176" y="374" width="680" height="588" rx="102" fill="#432A37" opacity="0.24"/>
  <path d="M310 357V270C310 146 398 64 512 64C626 64 714 146 714 270V357" stroke="#D8D5DF" stroke-width="92" stroke-linecap="round"/>
  <path d="M310 357V270C310 146 398 64 512 64C626 64 714 146 714 270V357" stroke="url(#grade-vault-locked-shackle)" stroke-width="80" stroke-linecap="round"/>
  <g>
    <rect x="160" y="354" width="704" height="606" rx="102" fill="#FFB44A"/>
    <rect x="160" y="354" width="704" height="606" rx="102" fill="url(#grade-vault-locked-body)"/>
    <rect x="160" y="354" width="704" height="606" rx="102" fill="url(#grade-vault-locked-body-glow)"/>
    <rect x="164" y="358" width="696" height="598" rx="98" stroke="url(#grade-vault-locked-rim)" stroke-width="8"/>
  </g>
  <g fill="#A34E36" opacity="0.22">
    <circle cx="534" cy="604" r="83"/>
    <path d="M489 662H579V784C579 809 559 829 534 829C509 829 489 809 489 784V662Z"/>
  </g>
  <g fill="#4D3B72">
    <circle cx="512" cy="580" r="83"/>
    <path d="M467 638H557V760C557 785 537 805 512 805C487 805 467 785 467 760V638Z"/>
  </g>`);

export const GRADE_VAULT_UNLOCKED_ICON = svg(`
  <defs>
    <linearGradient id="grade-vault-unlocked-body" x1="125" y1="382" x2="766" y2="927" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFE66A"/>
      <stop offset="0.35" stop-color="#FFC54E"/>
      <stop offset="0.72" stop-color="#FFA34B"/>
      <stop offset="1" stop-color="#FF8550"/>
    </linearGradient>
    <radialGradient id="grade-vault-unlocked-body-glow" cx="0" cy="0" r="1" gradientTransform="translate(361 423) rotate(47) scale(480 425)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF5A4" stop-opacity="0.78"/>
      <stop offset="1" stop-color="#FFF5A4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="grade-vault-unlocked-shackle" x1="645" y1="94" x2="970" y2="348" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F7F7FA"/>
      <stop offset="0.28" stop-color="#C9C7D2"/>
      <stop offset="0.57" stop-color="#EFEFF3"/>
      <stop offset="0.83" stop-color="#B486C9"/>
      <stop offset="1" stop-color="#9B63BB"/>
    </linearGradient>
    <linearGradient id="grade-vault-unlocked-rim" x1="431" y1="350" x2="431" y2="969" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF09A" stop-opacity="0.84"/>
      <stop offset="0.78" stop-color="#F58A60" stop-opacity="0"/>
      <stop offset="1" stop-color="#E96768" stop-opacity="0.65"/>
    </linearGradient>
  </defs>
  <rect x="96" y="374" width="680" height="588" rx="102" fill="#432A37" opacity="0.24"/>
  <path d="M624 354V263C624 139 706 64 804 64C902 64 982 142 982 260V306" stroke="#D8D5DF" stroke-width="92" stroke-linecap="round"/>
  <path d="M624 354V263C624 139 706 64 804 64C902 64 982 142 982 260V306" stroke="url(#grade-vault-unlocked-shackle)" stroke-width="80" stroke-linecap="round"/>
  <g>
    <rect x="80" y="354" width="704" height="606" rx="102" fill="#FFB44A"/>
    <rect x="80" y="354" width="704" height="606" rx="102" fill="url(#grade-vault-unlocked-body)"/>
    <rect x="80" y="354" width="704" height="606" rx="102" fill="url(#grade-vault-unlocked-body-glow)"/>
    <rect x="84" y="358" width="696" height="598" rx="98" stroke="url(#grade-vault-unlocked-rim)" stroke-width="8"/>
  </g>
  <g fill="#A34E36" opacity="0.22">
    <circle cx="454" cy="604" r="83"/>
    <path d="M409 662H499V784C499 809 479 829 454 829C429 829 409 809 409 784V662Z"/>
  </g>
  <g fill="#4D3B72">
    <circle cx="432" cy="580" r="83"/>
    <path d="M387 638H477V760C477 785 457 805 432 805C407 805 387 785 387 760V638Z"/>
  </g>`);
