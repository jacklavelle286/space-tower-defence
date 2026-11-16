// "My pictures" in the editor (Phase 42a): the approved pictures of the operator's library, offered by the picture
// picker next to the repo pictures. The list is read once per editor (R33 `?state=APPROVED`), the first time a picker
// opens or a picker shows a library picture. Drafts are never offered: publish would refuse them. Nor are pictures of
// a kind kept for later (Gate P2: avatars, aliens, planets…): publish refuses those too (`picture_not_for_activities`).
// A picture saved before kinds reads as "activity-object" and is offered.
//
// Without a provider (tests of single fields, the dev preview) there is simply no library.
import { isActivityPictureKind, pictureKindOf } from "@scd/shared";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { AdminApi } from "../api";

export type LibraryPicture = { readonly id: string; readonly name: string };

export type PictureLibrary = {
  /** The approved library pictures, or null until they are loaded. */
  readonly pictures: readonly LibraryPicture[] | null;
  readonly failed: boolean;
  /** Reads the list if it has not been read (or the last read failed). */
  readonly load: () => void;
};

const NONE: PictureLibrary = { pictures: [], failed: false, load: () => undefined };

const Context = createContext<PictureLibrary>(NONE);

export function PictureLibraryProvider({ api, children }: { readonly api: AdminApi; readonly children: ReactNode }) {
  const [pictures, setPictures] = useState<readonly LibraryPicture[] | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  const load = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    setFailed(false);
    api.listPictures("APPROVED").then(
      (list) =>
        setPictures(
          list.pictures.filter((p) => p.state === "APPROVED" && isActivityPictureKind(pictureKindOf(p.kind))).map((p) => ({ id: p.id, name: p.name })),
        ),
      () => {
        asked.current = false; // the next open tries again
        setFailed(true);
      },
    );
  }, [api]);
  const value = useMemo(() => ({ pictures, failed, load }), [pictures, failed, load]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePictureLibrary(): PictureLibrary {
  return useContext(Context);
}
