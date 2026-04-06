type ScreenHeaderProps = {
  title: string;
  description: string;
  onBack: () => void;
  backLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
};

export function ScreenHeader(props: ScreenHeaderProps) {
  const {
    title,
    description,
    onBack,
    backLabel = "返回主菜单",
    onClose,
    closeLabel = "关闭"
  } = props;

  return (
    <div className="screen-header">
      <div>
        <div className="eyebrow">AI TRPG 3.0</div>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
      <div className="button-row header-actions">
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
