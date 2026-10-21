package main

import (
	"bytes"
	"encoding/json"
)

const (
	agentVersion    = "1.1.0"
	protocolVersion = 1
)

type helloMsg struct {
	Type         string `json:"type"`
	V            int    `json:"v"`
	AgentVersion string `json:"agentVersion"`
	Arch         string `json:"arch"`
	Hostname     string `json:"hostname"`
	Kernel       string `json:"kernel"`
	CPUCount     int    `json:"cpuCount"`
}

type coreMsg struct {
	Name         string  `json:"name"`
	UsagePercent float64 `json:"usagePercent"`
}

type memMsg struct {
	TotalKb     uint64 `json:"totalKb"`
	AvailableKb uint64 `json:"availableKb"`
	UsedKb      uint64 `json:"usedKb"`
	SwapTotalKb uint64 `json:"swapTotalKb"`
	SwapFreeKb  uint64 `json:"swapFreeKb"`
	SwapUsedKb  uint64 `json:"swapUsedKb"`
}

type netMsg struct {
	Name          string  `json:"name"`
	RXBytesPerSec float64 `json:"rxBytesPerSec"`
	TXBytesPerSec float64 `json:"txBytesPerSec"`
}

type diskIOMsg struct {
	Device           string  `json:"device"`
	ReadBytesPerSec  float64 `json:"readBytesPerSec"`
	WriteBytesPerSec float64 `json:"writeBytesPerSec"`
	UtilPercent      float64 `json:"utilPercent"`
}

type pressureMsg struct {
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
	IO     float64 `json:"io"`
}

type diskMsg struct {
	Filesystem string  `json:"filesystem"`
	SizeKb     uint64  `json:"sizeKb"`
	UsedKb     uint64  `json:"usedKb"`
	AvailKb    uint64  `json:"availKb"`
	UsePercent float64 `json:"usePercent"`
	MountPoint string  `json:"mountPoint"`
}

type procMsg struct {
	PID        int     `json:"pid"`
	User       string  `json:"user"`
	CPUPercent float64 `json:"cpuPercent"`
	MemPercent float64 `json:"memPercent"`
	Command    string  `json:"command"`
}

type thermalMsg struct {
	ID      string  `json:"id"`
	Celsius float64 `json:"celsius"`
}

type gpuMsg struct {
	Index              int     `json:"index"`
	Name               string  `json:"name"`
	TemperatureC       float64 `json:"temperatureC"`
	UtilizationPercent float64 `json:"utilizationPercent"`
	MemoryUsedMb       float64 `json:"memoryUsedMb"`
	MemoryTotalMb      float64 `json:"memoryTotalMb"`
}

type metricsMsg struct {
	Type      string        `json:"type"`
	TSUnixMs  int64         `json:"tsUnixMs"`
	MonoNs    int64         `json:"monoNs"`
	CPU       float64       `json:"cpuTotalPercent"`
	Cores     []coreMsg     `json:"cpuCores"`
	Load      [3]float64    `json:"load"`
	Uptime    float64       `json:"uptimeSeconds"`
	Memory    memMsg        `json:"memory"`
	Network   []netMsg      `json:"network"`
	DiskIO    []diskIOMsg   `json:"diskIo"`
	Pressure  *pressureMsg  `json:"pressure,omitempty"`
	Disks     *[]diskMsg    `json:"disks,omitempty"`
	Processes *[]procMsg    `json:"processes,omitempty"`
	Thermals  *[]thermalMsg `json:"thermals,omitempty"`
	GPUs      *[]gpuMsg     `json:"gpus,omitempty"`
}

type killResultMsg struct {
	Type  string `json:"type"`
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type pongMsg struct {
	Type string `json:"type"`
}

type warnMsg struct {
	Type      string `json:"type"`
	Collector string `json:"collector"`
	Message   string `json:"message"`
}

func marshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}
