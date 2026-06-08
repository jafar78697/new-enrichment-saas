interface Props {
  rows?: number;
  cols?: number;
}

export default function SkeletonLoader({ rows = 5, cols = 5 }: Props) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} style={{ padding: '10px 14px' }}>
              <div
                className="skeleton"
                style={{ height: 14, width: j === 0 ? '60%' : j === cols - 1 ? '40%' : '80%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
