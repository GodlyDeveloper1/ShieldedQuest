// Shield with a keyhole: the mark for Shielded Quest. Solid fill on purpose:
// gradient ids clash when the logo appears twice (e.g. a hidden mobile header).
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5 4.5 7v8.2c0 7.1 4.9 12.6 11.5 14.3 6.6-1.7 11.5-7.2 11.5-14.3V7L16 2.5Z" fill="#f4b728" />
      <circle cx="16" cy="13.5" r="3.4" fill="#1a1400" />
      <path d="M14.4 15.5h3.2l1.1 6.3h-5.4l1.1-6.3Z" fill="#1a1400" />
    </svg>
  );
}
