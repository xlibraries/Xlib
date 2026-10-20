export default function SmallArrow({ angle = "up", className = "" }: { angle?: "up" | "down" | "left" | "right"; className?: string }) {
    return <div className={className + " arrow-custom-" + angle}></div>;
}
