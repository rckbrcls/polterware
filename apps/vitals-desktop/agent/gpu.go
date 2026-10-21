package main

import (
	"context"
	"os/exec"
	"time"

	"github.com/polterware/polterware/apps/vitals-desktop/agent/internal/metrics"
)

func hasNvidiaSMI() bool {
	_, err := exec.LookPath("nvidia-smi")
	return err == nil
}

func sampleNvidiaSMI() ([]gpuMsg, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total",
		"--format=csv,noheader,nounits")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	gpus := metrics.ParseNvidiaSMI(string(out))
	msgs := make([]gpuMsg, len(gpus))
	for i, g := range gpus {
		msgs[i] = gpuMsg{
			Index: g.Index, Name: g.Name, TemperatureC: g.TemperatureC,
			UtilizationPercent: g.UtilizationPercent,
			MemoryUsedMb:       g.MemoryUsedMb, MemoryTotalMb: g.MemoryTotalMb,
		}
	}
	return msgs, nil
}
