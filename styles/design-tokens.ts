export const designTokens = {
  spacing: {
    0: "0px",
    0.5: "2px",
    1: "4px",
    1.5: "6px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
    20: "80px",
    24: "96px"
  },
  typography: {
    fontSize: {
      xs: "12px",
      sm: "13px",
      base: "14px",
      lg: "16px",
      xl: "18px",
      "2xl": "20px"
    },
    lineHeight: {
      tight: "1.25",
      snug: "1.375",
      normal: "1.5"
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600
    }
  },
  colors: {
    semantic: {
      success: "semantic-success",
      warning: "semantic-warning",
      danger: "semantic-danger",
      info: "semantic-info"
    }
  },
  layout: {
    appMaxWidth: "1400px",
    sidebarWidth: "272px",
    contentPadding: "24px"
  },
  components: {
    card: {
      base: "rounded-lg border bg-card text-card-foreground shadow-elev-1",
      header: "flex items-start justify-between gap-3 px-4 py-3",
      content: "px-4 pb-4",
      title: "text-sm font-medium tracking-tight",
      description: "text-xs text-muted-foreground"
    },
    table: {
      wrapper: "rounded-lg border bg-card shadow-elev-1",
      toolbar: "flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between",
      header: "text-xs font-medium text-muted-foreground",
      cell: "text-sm",
      rowHover: "hover:bg-muted/50"
    }
  }
} as const;

