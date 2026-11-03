// Fighters Academy logo (hexagon badge with the hammer and the name). The picture already
// includes the name, so no separate wordmark is shown next to it.
export function Logo({ size = 140, title = 'Fighters Academy' }: { size?: number; title?: string }) {
  return <img className="brand-mark" src={`${import.meta.env.BASE_URL}logo.png`} width={size} height={size} alt={title} />;
}
