export function Thumb({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} className="h-12 w-12 rounded-full outline-slate-200" />;
}
