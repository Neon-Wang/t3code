import { useI18n } from "~/hooks/useI18n";
import {
  DUO_POSES,
  type DuoCommand,
  type DuoControlState,
} from "@t3tools/client-runtime/device/duo-control";
import type { DeviceScreenSize } from "@t3tools/client-runtime/device/stream";
import { DeviceDuoGlyph } from "./DeviceDuoGlyph";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

/** Physical presets live beside the device. Pinching supplies continuous hinge control. */
export function DeviceDuoControls(props: {
  screen: DeviceScreenSize;
  state: DuoControlState;
  enabled: boolean;
  onCommand: (command: DuoCommand) => void;
}) {
  const { t } = useI18n();
  const poseLabels = {
    closed: t("device.pose.closed"),
    book: t("device.pose.book"),
    open: t("device.pose.open"),
    laptop: t("device.pose.laptop"),
    tent: t("device.pose.tent"),
  };
  const angle = props.screen.hingeAngle;
  const fold = angle == null ? null : angle === 0 ? "closed" : angle === 180 ? "open" : "book";
  const selected = (id: (typeof DUO_POSES)[number]["id"]) =>
    id === "laptop" || id === "tent" ? props.screen.hingePose === id : fold === id;
  return (
    <div aria-label={t("device.iphoneDuoStands")} className="flex flex-col items-center gap-2">
      {([DUO_POSES.slice(0, 3), DUO_POSES.slice(3)] as const).map((poses, index) => (
        <div
          key={poses[0]?.id}
          role="group"
          aria-label={index === 0 ? t("device.foldShape") : t("device.deviceStance")}
          className="pointer-events-auto flex shrink-0 flex-col items-center gap-1 rounded-full border border-border/50 bg-background/80 p-1 shadow-sm"
        >
          {poses.map((pose) => (
            <Tooltip key={pose.id}>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    variant={selected(pose.id) ? "secondary" : "ghost"}
                    disabled={!props.enabled}
                    aria-label={t("device.valueStand", { arg0: poseLabels[pose.id] })}
                    aria-pressed={selected(pose.id)}
                    data-pressed={selected(pose.id) ? "" : undefined}
                    onClick={() => props.onCommand({ control: "pose", value: pose.id })}
                  />
                }
              >
                <DeviceDuoGlyph pose={pose.id} />
              </TooltipTrigger>
              <TooltipPopup side="left">
                {poseLabels[pose.id]}
                {pose.id === "book" ? t("device.bookshelf") : ""}
              </TooltipPopup>
            </Tooltip>
          ))}
        </div>
      ))}
      {props.state.error ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                role="alert"
                aria-label={props.state.error}
                className="pointer-events-auto text-xs text-destructive"
              >
                !
              </span>
            }
          />
          <TooltipPopup side="left">{props.state.error}</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
}
