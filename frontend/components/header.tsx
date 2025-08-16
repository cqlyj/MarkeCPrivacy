import { ModeToggle } from "./mode-toggle";

export default function Header() {
  return (
    <div
      className={
        "absolute top-0 flex items-center justify-end w-full py-2 z-40"
      }
    >
      <div className="pr-4">
        <ModeToggle />
      </div>
    </div>
  );
}
