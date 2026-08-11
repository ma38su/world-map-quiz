import 'flag-icons/css/flag-icons.min.css'

export default function CountryFlag({ code, className = '' }: { code: string; className?: string }) {
  return (
    <span className={`country-flag ${className}`.trim()} aria-hidden="true">
      <span className={`fi fi-${code.toLowerCase()}`} />
    </span>
  )
}
