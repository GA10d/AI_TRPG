import type { ReactNode } from "react";

import { useUiText } from "../locales/index.tsx";

type ScreenHeaderProps = {
  title: string;
  description: string;
  onBack: () => void;
  backLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
  actions?: ReactNode;
};

export function ScreenHeader(props: ScreenHeaderProps) {
  const text = useUiText();
  const {
    title,
    description,
    onBack,
    backLabel = text.screenHeader.defaultBackLabel,
    onClose,
    closeLabel = text.screenHeader.defaultCloseLabel,
    actions
  } = props;

  return (
    <div className="screen-header">
      <div>
        <div className="eyebrow">{text.appName}</div>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
      <div className="button-row header-actions">
        {actions}
        <button className="ghost-button" onClick={onBack} type="button">
          {backLabel}
        </button>
        {onClose ? (
          <button className="ghost-button" onClick={onClose} type="button">
            {closeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
