export default function Avatar({ collaborateur, size = 28 }) {
  if (!collaborateur) return null;
  return (
    <div
      title={`${collaborateur.prenom} ${collaborateur.nom}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: collaborateur.couleur,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.39,
        fontWeight: 500,
        color: '#fff',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {collaborateur.initiales}
    </div>
  );
}
