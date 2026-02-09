/// <reference types="vite/client" />
import bgImg from '../img/bg-1.png'

interface PageLayoutProps {
  children: React.ReactNode
  /** 是否使用较半透明的背景（蒙版更深，与登录页区分） */
  semiTransparent?: boolean
  /** 内容区最大宽度，默认 1100px */
  maxWidth?: string
}

/**
 * 与登录注册页类似风格：背景图 + 渐变蒙版（可半透明）+ 居中卡片
 */
export default function PageLayout({
  children,
  semiTransparent = true,
  maxWidth = '1100px',
}: PageLayoutProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 box-border relative overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgImg})` }}
    >
      {/* 半透明蒙版：比登录页更深，突出内容卡片 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: semiTransparent
            ? 'linear-gradient(135deg, rgba(50,188,239,0.35) 0%, rgba(44,79,163,0.45) 100%)'
            : 'linear-gradient(135deg, rgba(50,188,239,0.08) 0%, rgba(44,79,163,0.12) 100%)',
        }}
        aria-hidden
      />
      <div
        className="w-full rounded-[24px] overflow-hidden bg-white relative z-10 shadow-[0_25px_80px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.08)_inset]"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  )
}
