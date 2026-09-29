# Vistralo identity and icons

The opposed capture-frame emblem is original Vistralo artwork. Product names are live text in Inter; the prior outlined Geist wordmark is not used by this interface.

`web/components/Icon.tsx` embeds unchanged SVG paths from Microsoft's Fluent System Icons Regular family, `@fluentui/react-icons` 2.0.341. Native 16, 20 and 24 pixel variants are selected when available. Only directional navigation icons mirror for right-to-left layouts.

Source: https://github.com/microsoft/fluentui-system-icons

The upstream MIT license is included verbatim in `FLUENT-LICENSE.txt`. No icon font, UI framework, network font request or runtime icon dependency is needed.
