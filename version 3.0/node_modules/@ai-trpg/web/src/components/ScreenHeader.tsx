type ScreenHeaderProps = {
  title: string;
  description: string;
  onBack: () => void;
};

export function ScreenHeader(props: ScreenHeaderProps) {
  const { title, description, onBack } = props;

  return (
    <div className="screen-header">
      <div>
        <div className="eyebrow">AI TRPG 3.0</div>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
      <button className="ghost-button" onClick={onBack} type="button">
        返回主菜单
      </button>
    </div>
  );
}
