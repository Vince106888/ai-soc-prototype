import type { SVGProps } from 'react'

/* eslint-disable react-refresh/only-export-components -- shared stateless SVG primitives */

type IconProps = SVGProps<SVGSVGElement>

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      {children}
    </svg>
  )
}

export const Icons = {
  grid: (props: IconProps) => <IconBase {...props}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" strokeWidth="1.7" /></IconBase>,
  shield: (props: IconProps) => <IconBase {...props}><path d="M12 3 4.8 6v5.2c0 4.7 3 8.4 7.2 9.8 4.2-1.4 7.2-5.1 7.2-9.8V6L12 3Z" stroke="currentColor" strokeWidth="1.7" /><path d="m9 12 2 2 4.2-4.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>,
  alert: (props: IconProps) => <IconBase {...props}><path d="m12 3 9 16H3l9-16Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /><path d="M12 9v4m0 3h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></IconBase>,
  building: (props: IconProps) => <IconBase {...props}><path d="M4 21V5l8-2v18m0-13h8v13M2 21h20M7 8h2m-2 4h2m-2 4h2m8-4h-2m2 4h-2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>,
  settings: (props: IconProps) => <IconBase {...props}><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" strokeWidth="1.7" /><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0V19a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 0 1-2.8-2.8L4 15a1.7 1.7 0 0 0-1.2-2.9h-.2a2 2 0 0 1 0-4h.2A1.7 1.7 0 0 0 4 5.2l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V1a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" /></IconBase>,
  search: (props: IconProps) => <IconBase {...props}><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></IconBase>,
  scan: (props: IconProps) => <IconBase {...props}><path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4m13 5h4a1 1 0 0 0 1-1v-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></IconBase>,
  arrow: (props: IconProps) => <IconBase {...props}><path d="m9 18 6-6-6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></IconBase>,
  check: (props: IconProps) => <IconBase {...props}><path d="m5 12 4 4L19 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></IconBase>,
  clock: (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" /><path d="M12 7v5l3.5 2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></IconBase>,
  close: (props: IconProps) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></IconBase>,
  refresh: (props: IconProps) => <IconBase {...props}><path d="M20 6v5h-5M4 18v-5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M6.1 9a7 7 0 0 1 11.7-2.2L20 11M4 13l2.2 4.2A7 7 0 0 0 18 15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></IconBase>,
  menu: (props: IconProps) => <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></IconBase>,
  lock: (props: IconProps) => <IconBase {...props}><rect height="10" rx="2" stroke="currentColor" strokeWidth="1.7" width="14" x="5" y="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" /></IconBase>,
  activity: (props: IconProps) => <IconBase {...props}><path d="M3 12h4l2.2-6 4.1 12L16 12h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></IconBase>,
  info: (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" /><path d="M12 11v6m0-10h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></IconBase>,
  mail: (props: IconProps) => <IconBase {...props}><rect height="14" rx="2" stroke="currentColor" strokeWidth="1.7" width="18" x="3" y="5" /><path d="m4 7 8 6 8-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>,
  link: (props: IconProps) => <IconBase {...props}><path d="m10 13.8 4-4M7.5 15.5l-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M16.5 8.5l1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></IconBase>,
  key: (props: IconProps) => <IconBase {...props}><circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.7" /><path d="m11 12 8-8m-3 0h3v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>,
  user: (props: IconProps) => <IconBase {...props}><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></IconBase>,
  sparkle: (props: IconProps) => <IconBase {...props}><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Zm7 10 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></IconBase>,
}
