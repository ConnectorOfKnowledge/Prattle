interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  activeColor?: string  // default 'bg-cd-accent'
  label?: string
}

export default function Toggle({ checked, onChange, activeColor = 'bg-cd-accent', label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cd-accent/50 ${
        checked ? activeColor : 'bg-gray-600'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform absolute top-0.5 ${
          checked ? 'left-[22px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}
