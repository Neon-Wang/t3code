import type { PullRequestLabel } from "@t3tools/contracts";
import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { pullRequestLabelColor } from "../pull-requests/pullRequestList";
export function LabelPill({ label }: { readonly label: PullRequestLabel }) {
  const color = pullRequestLabelColor(label.color);
  return (
    <View
      className="max-w-full flex-row items-center gap-1.5 rounded-2xl bg-grouped-card px-3 py-1"
      style={color ? { backgroundColor: `${color}20` } : undefined}
    >
      {color ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      ) : null}
      <Text textRole="caption" className="shrink text-foreground-muted" numberOfLines={1}>
        {label.name}
      </Text>
    </View>
  );
}
