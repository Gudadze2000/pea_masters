import { Link } from "react-router";
import { IconUserCircle } from "@tabler/icons-react";
import { useActionQuery } from "@agent-native/core/client/hooks";

// The signed-in user's photo as a round link to their profile; falls back to an icon.
export function ProfileAvatar({ size = 36 }: { size?: number }) {
  const photo = useActionQuery("get-my-photo", {});
  const dataUrl = (photo.data as { dataUrl?: string | null } | undefined)?.dataUrl ?? null;
  return (
    <Link to="/profile" aria-label="My profile" className="inline-flex shrink-0 items-center justify-center">
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="My profile"
          style={{ width: size, height: size }}
          className="rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <IconUserCircle size={size} stroke={1.6} className="text-primary" />
      )}
    </Link>
  );
}
